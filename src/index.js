import { getObjectHash, isEqual, throttle, isArray } from 'ts-fns'

const SOURCE_TYPES = {
  SOURCE: Symbol(1),
  COMPOSE: Symbol(2),
  SETUP: Symbol(3),
}

const HOSTS_CHAIN = []
const HOOKS_CHAIN = []

let isInitingCompoundSource = false

export function source(get, value) {
  const source = {
    type: SOURCE_TYPES.SOURCE,
    get,
    atoms: [],
    value,
  }
  return source
}

export function compose(get) {
  isInitingCompoundSource = true
  const value = get()
  isInitingCompoundSource = false
  const source = {
    type: SOURCE_TYPES.COMPOSE,
    get,
    atoms: [],
    value,
  }
  return source
}

export function query(source, ...params) {
  const { type, value } = source
  if (isInitingCompoundSource) {
    return [value, () => {}]
  }
  else if (type === SOURCE_TYPES.SOURCE) {
    return querySource(source, ...params)
  }
  else if (type === SOURCE_TYPES.COMPOSE) {
    return queryCompose(source, ...params)
  }
}

// 向上冒泡
const emit = (atom) => {
  if (!atom.hosts) {
    return
  }

  atom.hosts.forEach((host, i) => {
    if (host.end) {
      atom.hosts.splice(i, 1)
    }
    else {
      host.next()
    }
  })
}

const host = (atom) => {
  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]

  if (!host) {
    return
  }

  if (!host.deps.includes(atom)) {
    host.deps.push(atom)
  }

  atom.hosts = atom.hosts || []
  if (!atom.hosts.includes(host)) {
    atom.hosts.push(host)
  }
}

function querySource(source, ...params) {
  const { atoms, value, get } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  // 找到对应的原子
  if (atom) {
    host(atom)
    return [atom.value, atom.next]
  }

  // 默认原子
  const item = { hash, value }
  atoms.push(item)

  const next = () => {
    if (item.deferer) {
      return item.deferer
    }

    const res = get(...params)

    if (res instanceof Promise) {
      item.deferer = res
        .then((value) => {
          item.value = value
          emit(item)
          return value
        })
        .finally(() => {
          item.deferer = null
        })
      return item.deferer
    }

    // 如果是同步函数，会立即把值计算出来，这样就不需要在做一次更新
    item.deferer = Promise.resolve()
      .then(() => {
        item.value = res
        emit(item)
        return res
      })
      .finally(() => {
        item.deferer = null
      })
    return item.deferer
  }
  item.next = next

  // 立即开始请求
  next()
  // 加入图中
  host(item)

  return [value, next]
}

function queryCompose(source, ...params) {
  const { atoms, get, value } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    host(atom)
    return [atom.value, atom.broadcast]
  }

  const item = { hash, value, deps: [], hooks: [] }
  atoms.push(item)

  const run = () => {
    HOSTS_CHAIN.push(item)
    const value = get(...params)
    item.value = value
    HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }

  const next = () => {
    run(item)
    emit(item)
    return Promise.resolve(item.value)
  }
  item.next = next

  const broadcast = (...sources) => {
    // host will recompute/popagate in dep.next, so we do not need to do `next` any more

    const deps = item.deps

    // 如果传入了对应的source，那么只更新内部对应这几个source的内容
    if (sources.length) {
      const needs = []
      sources.forEach((source) => {
        source.atoms.forEach((atom) => {
          if (deps.includes(atom) && !needs.includes(atom)) {
            needs.push(atom)
          }
        })
      })
      const reqs = needs.map(atom => atom.next())
      return Promise.all(reqs).then(() => item.value)
    }

    const reqs = deps.map(atom => atom.next())
    return Promise.all(reqs).then(() => item.value)
  }
  item.broadcast = broadcast

  // 立即计算
  run(item)
  // 加入图中
  host(item)

  return [item.value, broadcast]
}

export function setup(run) {
  const root = { deps: [], hooks: [], root: true }
  const stop = () => {
    root.end = true
  }
  stop.value = null

  const next = throttle(() => {
    HOSTS_CHAIN.push(root)
    stop.value = run()
    // HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }, 10)
  root.next = next

  stop.next = () => {
    if (!atom.end) {
      return
    }
    root.end = false
    next()
  }

  next()

  return stop
}

/**
 * 清空些数据源的已有数据
 * @param {array|object} sources
 */
export function release(sources) {
  if (!isArray(sources)) {
    sources = Object.values(sources)
  }

  sources.forEach((source) => {
    source.atoms = []
  })
}

/**
 * 对一个source发起请求，发起请求时，根据参数信息决定是否使用缓存
 * 注意，这个动作可能会参数副作用，但由于不在step中执行，没有上下文环境，又不会触发hooks，因此，你需要明确这个source在被request时，不被用于代数上下文
 * @param {boolean} [force] true 如果第一个参数为true，表示强制请求该数据源
 * @param {Source} source
 * @param  {...any} params
 * @returns {Promise}
 */
export function request(source, ...params) {
  let force = false
  if (source === true) {
    force = true
    source = params.shift()
  }

  const { atoms, type } = source
  if (type !== SOURCE_TYPES.SOURCE) {
    throw new Error(`[alegb]: request can only work with atom source not compound source.`)
  }

  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  // 找到对应的原子
  if (atom && !force) {
    return Promise.resolve(atom.value)
  }

  return atom.next()
}

/**
 * 判断一个值是否为source
 * @param {*} source
 * @returns {boolean}
 */
export function isSource(source) {
  return Object.values(SOURCE_TYPES).includes(source && source.type)
}

// hooks -------------

export function affect(invoke, deps) {
  if (isInitingCompoundSource) {
    return
  }

  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const index = HOOKS_CHAIN.length

  HOOKS_CHAIN.push(1)

  const hook = host.hooks[index]
  if (hook) {
    if (!deps && !hook.deps) {
      return
    }
    if (!isEqual(deps, hook.deps)) {
      if (hook.revoke) {
        hook.revoke()
      }
      const revoke = invoke()
      host.hooks[index] = { deps, revoke }
    }
  }
  else {
    const revoke = invoke()
    host.hooks[index] = { deps, revoke }
  }
}

export function select(compute, deps) {
  if (isInitingCompoundSource) {
    const value = compute()
    return value
  }

  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const index = HOOKS_CHAIN.length

  HOOKS_CHAIN.push(1)

  const hook = host.hooks[index]
  if (hook) {
    if (!deps && !hook.deps) {
      hook.deps = deps
      return hook.value
    }
    else if (isEqual(deps, hook.deps)) {
      hook.deps = deps
      return hook.value
    }
    else {
      const value = compute()
      hook.value = value
      hook.deps = deps
      return value
    }
  }
  else {
    const value = compute()
    host.hooks[index] = { deps, value }
    return value
  }
}

export function apply(get, value) {
  if (isInitingCompoundSource) {
    return () => [value, () => {}]
  }

  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const index = HOOKS_CHAIN.length

  HOOKS_CHAIN.push(1)

  const hook = host.hooks[index]
  if (hook) {
    const { query } = hook
    return query
  }
  else {
    const Source = source(get, value)
    const next = (...args) => query(Source, ...args)
    const hook = { query: next }
    host.hooks[index] = hook
    return next
  }
}

export function ref(value) {
  if (isInitingCompoundSource) {
    return { value }
  }

  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const index = HOOKS_CHAIN.length

  HOOKS_CHAIN.push(1)

  const hook = host.hooks[index]
  if (hook) {
    return hook
  }
  else {
    const hook = { value }
    host.hooks[index] = hook
    return hook
  }
}
