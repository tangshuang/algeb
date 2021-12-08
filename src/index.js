import { getObjectHash, isEqual, throttle } from 'ts-fns'

const SOURCE_TYPES = {
  SOURCE: 1,
  COMPOSE: 2,
  SETUP: 3,
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
    return [value]
  }
  else if (type === SOURCE_TYPES.SOURCE) {
    return querySource(source, ...params)
  }
  else if (type === SOURCE_TYPES.COMPOSE) {
    return queryCompose(source, ...params)
  }
}

function querySource(source, ...params) {
  const { atoms, value, get } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  // 找到对应的原子
  if (atom) {
    return [atom.value, atom.next]
  }

  // 默认原子
  const item = { hash, value }
  atoms.push(item)

  const emit = () => {
    if (!item.hosts) {
      return
    }

    item.hosts.forEach((host, i) => {
      if (host.end) {
        item.hosts.splice(i, 1)
      }
      else {
        host.next()
      }
    })
  }

  const next = () => {
    if (item.deferer) {
      return
    }

    const res = get(...params)

    if (res instanceof Promise) {
      item.deferer = res
        .then((value) => {
          item.value = value
          // reset
          item.deferer = null
        })
        // 如果是异步的，就再触发一次
        .then(() => {
          emit()
        })
      return item.deferer
    }

    // 如果是同步函数，会立即把值计算出来，这样就不需要在做一次更新
    item.value = res
    emit()
    return Promise.resolve(res)
  }
  item.next = next

  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const root = HOSTS_CHAIN[0]

  if (root) {
    item.root = root
  }

  if (host) {
    host.deps.push(item)
    item.hosts = [host]
  }

  // 立即开始请求
  next()

  return [value, next]
}

function queryCompose(source, ...params) {
  const { atoms, get, value } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    return [atom.value, atom.emit]
  }

  const item = { hash, value, deps: [], hooks: [] }
  atoms.push(item)

  const compute = (atom) => {
    HOSTS_CHAIN.push(atom)
    const value = get(...params)
    atom.value = value
    HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }

  const next = () => {
    const atom = atoms.find(item => item.hash === hash)
    compute(atom)
    // recompute
    atom.hosts.forEach((host, i) => {
      if (host.end) { // the host is destoryed
        atom.hosts.splice(i, 1)
      }
      else {
        host.next()
      }
    })
  }

  const emit = throttle((...cells) => {
    const atom = atoms.find(item => item.hash === hash)
    // host will recompute/popagate in dep.next, so we do not need to do `next` any more
    const deps = cells.length ? atom.deps.filter(dep => cells.includes(dep.source)) : atom.deps
    deps.map(dep => dep.next())
  }, 16)


  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]

  // 立即计算
  compute(item)

  if (host) {
    host.deps.push(item)
    item.hosts.push(host)
  }

  return [item.value, emit]
}

export function setup(run) {
  const atom = { deps: [], hooks: [] }
  const stop = () => {
    atom.end = true
  }
  stop.value = null

  const next = () => {
    HOSTS_CHAIN.push(atom)
    stop.value = run()
    // HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }
  atom.next = next
  next()

  // 创建一个队列，队列内保持所有源的更新操作，当全部更新结束后，执行副作用
  // 最多每16ms执行一次
  const queue = []
  const consume = throttle(() => {
    Promise.all(queue.map(fn => Promise.resolve(fn()))).then(() => {
      next()
    })
    queue.length = 0
  }, 16)
  const push = (fn) => { // 这里的fn必须是atom.next
    if (!queue.includes(fn)) {
      queue.push(fn)
    }
    consume()
  }
  atom.push = push

  stop.next = () => {
    if (!atom.end) {
      return
    }
    atom.end = false
    next()
  }

  return stop
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
    return
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
    return (value => [value])
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
