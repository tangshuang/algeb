import { getObjectHash, isEqual, isArray } from 'ts-fns'

export const SOURCE_TYPES = {
  SOURCE: Symbol(1),
  COMPOSE: Symbol(2),
  SETUP: Symbol(3),
  ACTION: Symbol(4),
}

const HOSTS_CHAIN = []
const HOOKS_CHAIN = []

let isInitingSource = false

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
  isInitingSource = true
  const value = get()
  isInitingSource = false
  const source = {
    type: SOURCE_TYPES.COMPOSE,
    get,
    atoms: [],
    value,
  }
  return source
}

export function action(act) {
  const cache = {}
  const fn = (...args) => {
    const hash = getObjectHash(args)
    if (cache[hash]) {
      return cache[hash]
    }

    cache[hash] = Promise.resolve(act(...args)).finally(() => {
      cache[hash] = null
    })
    return cache[hash]
  }
  const source = {
    type: SOURCE_TYPES.ACTION,
    act: fn,
  }
  return source
}

export function query(source, ...params) {
  const { type, value } = source
  if (isInitingSource) {
    return [value, () => Promise.resolve(value), Promise.resolve(value)]
  }
  else if (type === SOURCE_TYPES.SOURCE) {
    return querySource(source, ...params)
  }
  else if (type === SOURCE_TYPES.COMPOSE) {
    return queryCompose(source, ...params)
  }
  // 不提供query能力
  else {
    return [value, () => Promise.resolve(value), Promise.resolve(value)]
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

// 附加到当前宿主
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
    return [atom.value, atom.next, atom.deferer]
  }

  // 默认原子
  const item = { hash, value }

  const next = () => {
    if (item.defering) {
      return item.deferer
    }

    const res = get(...params)
    item.defering = 1
    item.deferer = Promise.resolve(res)
      .then((value) => {
        item.value = value
        emit(item)
        return res
      })
      .finally(() => {
        item.defering = 0
      })

    return item.deferer
  }
  item.next = next

  // 立即开始请求
  const deferer = next()
  // 生成好了next, deferer, defering
  atoms.push(item)

  // 加入图中
  host(item)

  return [value, next, deferer]
}

function queryCompose(source, ...params) {
  const { atoms, get, value } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    host(atom)
    return [atom.value, atom.broadcast, atom.deferer]
  }

  const item = { hash, value, deps: [], hooks: [] }

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

  // 生成必备的内容
  atoms.push(item)

  // 加入图中
  host(item)

  const deps = item.deps
  const deferer = Promise.all(deps.filter(dep => dep.deferer).map(dep => dep.deferer)).then(() => item.value)

  return [item.value, broadcast, deferer]
}

// 解除全部effects，避免内存泄露
const traverseFree = (host) => {
  if (host.hooks) {
    host.hooks.forEach(({ revoke }) => {
      revoke && revoke()
    })
  }
  if (host.deps) {
    host.deps.forEach((dep) => {
      dep.hosts.forEach((item, i) => {
        if (item === host) {
          dep.hosts.splice(i, 1)
        }
      })
      traverseFree(dep)
    })
  }
}

export function setup(run) {
  const root = { deps: [], hooks: [], root: true }
  const stop = () => {
    root.end = true
    traverseFree(root)
  }
  stop.value = null
  stop.stop = stop

  const next = () => {
    HOSTS_CHAIN.push(root)
    stop.value = run()
    // HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }
  root.next = next

  stop.next = () => {
    // 还在进行中的，就不需要持续跟进
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
    source.atoms.forEach(traverseFree)
    source.atoms = []
  })
}

/**
 * 对一个source发起请求，发起请求时，根据参数信息决定是否使用缓存
 * @param {boolean} [force] true 如果第一个参数为true，表示强制请求该数据源，如果为false
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

  if (type === SOURCE_TYPES.ACTION) {
    return source.act(...params)
  }

  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  const resolve = (run) => {
    // 对应的atom还不存在，那么要创建这个atom
    if (!atom) {
      return run()
    }
    // 找到对应的原子，使用缓存
    if (!force) {
      return Promise.resolve(atom.value)
    }
    // 找到对应原子，但强制更新
    return run()
  }

  if (HOSTS_CHAIN.some(item => item.root)) {
    if (type !== SOURCE_TYPES.SOURCE) {
      throw new Error(`[alegb]: request here can only work with atom source, can not with compound source.`)
    }
    const run = () => {
      const [, renew] = querySource(source, ...params)
      return renew()
    }
    return resolve(run)
  }

  const run = () => {
    return new Promise((resolve) => {
      const stop = setup(() => {
        const [, renew] = query(source, ...params)
        resolve(renew())
      })
      stop()
    })
  }
  return resolve(run)
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
  if (isInitingSource) {
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
  if (isInitingSource) {
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
  if (isInitingSource) {
    return () => [value, () => Promise.resolve(value)]
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
  if (isInitingSource) {
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
