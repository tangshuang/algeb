import { getObjectHash, isEqual, isArray } from 'ts-fns'

export const SOURCE_TYPES = {
  SOURCE: Symbol('source'),
  COMPOSE: Symbol('compose'),
  SETUP: Symbol('setup'),
  ACTION: Symbol('action'),
}

const HOSTS_CHAIN = []
const HOOKS_CHAIN = []

let isInitingSource = false


function Event() {
  this.listeners = []
}
Event.prototype.on = function(type, fn) {
  this.listeners.push({ type, fn })
}
Event.prototype.emit = function(type, ...args) {
  this.listeners.forEach((item) => {
    if (item.type !== type) {
      return
    }
    item.fn(...args)
  })
}
Event.prototype.off = function(type, fn) {
  this.listeners.forEach((item, i) => {
    if (item.type === type && item.fn === fn) {
      this.listeners.splice(i, 1)
    }
  })
}
Event.prototype.has = function(type) {
  return this.listeners.some(item => item.type === type)
}
Event.prototype.clear = function() {
  this.listeners = []
}

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
    return [value, () => Promise.resolve(value), Promise.resolve(value), new Event()]
  }
  if (type === SOURCE_TYPES.SOURCE) {
    return querySource(source, ...params)
  }
  if (type === SOURCE_TYPES.COMPOSE) {
    return queryCompose(source, ...params)
  }
  if (type === SOURCE_TYPES.ACTION) {
    throw new Error(`[alegb]: action不能用在query中，只能用在request中，query只能使用source.`)
  }
}

// 向上冒泡
const propagateAffect = (atom) => {
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
const propagatePrepareFlush = (atom) => {
  if (!atom.hosts) {
    return
  }

  atom.hosts.forEach((host, i) => {
    if (host.end) {
      atom.hosts.splice(i, 1)
    }
    else if (host.prepareFlush) {
      host.prepareFlush()
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

  const event = source.event = source.event || new Event()
  // 默认原子
  const item = {
    hash,
    value,
    event,
  }

  const prepareFlush = () => {
    const prev = item.value
    event.emit('beforeAffect', {
      args: params,
      prev,
    })
    propagatePrepareFlush(item)
    event.emit('beforeFlush', {
      args: params,
      prev,
    })
  }

  const next = () => {
    if (item.defering) {
      return item.deferer
    }

    const prev = item.value
    prepareFlush()

    const res = get(...params)
    item.defering = 1
    item.deferer = Promise.resolve(res)
      .then((value) => {
        item.value = value
        event.emit('afterFlush', {
          args: params,
          next: value,
          prev,
        })

        propagateAffect(item)
        event.emit('afterAffect', {
          args: params,
          next: value,
          prev,
        })

        event.emit('done', {
          args: params,
          next: value,
          prev,
        })
        return value
      }, (e) => {
        event.emit('fail', {
          args: params,
          error: e,
        })
      })
      .finally(() => {
        item.defering = 0
        event.emit('finish', {
          args: params,
        })
      })

    return item.deferer
  }
  item.next = next
  item.prepareFlush = prepareFlush

  // 立即开始请求
  next()

  // 生成好了next, deferer, defering
  atoms.push(item)

  // 加入图中
  host(item)

  return [item.value, next, item.deferer]
}

function queryCompose(source, ...params) {
  const { atoms, get, value } = source
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    host(atom)
    return [atom.value, atom.broadcast, atom.deferer]
  }

  const event = source.event = source.event || new Event()
  const item = {
    hash,
    value,
    deps: [],
    hooks: [],
    event,
  }

  const run = () => {
    HOSTS_CHAIN.push(item)
    const value = get(...params)
    item.value = value
    HOSTS_CHAIN.pop()
  }

  const prepareFlush = () => {
    const prev = item.value
    event.emit('beforeAffect', {
      args: params,
      prev,
    })
    propagatePrepareFlush(item)
    event.emit('beforeFlush', {
      args: params,
      prev,
    })
  }
  const next = () => {
    const prev = item.value

    run(item)
    const next = item.value
    event.emit('afterFlush', {
      args: params,
      next,
      prev,
    })

    propagateAffect(item)
    event.emit('afterAffect', {
      args: params,
      next,
      prev,
    })

    return Promise.resolve(next)
  }
  item.next = next
  item.prepareFlush = prepareFlush

  const broadcast = (...sources) => {
    // 内部会去遍历依赖，并触发依赖的重新计算，
    // 而依赖完成重新计算之后，又会回头往上冒泡触发当前source的 `next` `prepareFlush`，因此，不需要关心这两个动作
    // flush是先捕获再冒泡，beforeFlush类似捕获，afterFlush类似冒泡
    // affect是先冒泡再捕获，beforeAffect类似冒泡，afterAffect类似捕获
    // 对于同一个atom，顺序为：beforeAffect -> beforeFlush -> afterFlush -> afterAffect

    const deps = item.deps

    const prev = item.value
    const defer = (reqs) => {
      item.deferer = Promise.all(reqs)
        .then(() => {
          const next = item.value
          event.emit('done', {
            args: params,
            next,
            prev,
          })
          return next
        }, (e) => {
          event.emit('fail', {
            args: params,
            error: e,
          })
        })
        .finally(() => {
          event.emit('finish', {
            args: params,
          })
        })
      return item.deferer
    }

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
      return defer(reqs)
    }

    const reqs = deps.map(atom => atom.next())
    return defer(reqs)
  }
  item.broadcast = broadcast

  // 立即计算
  run(item)

  // 生成必备的内容
  atoms.push(item)

  // 加入图中
  host(item)

  // 等依赖全部ready之后deferer才resolve
  const deps = item.deps
  item.deferer = Promise.all(deps.filter(dep => dep.deferer).map(dep => dep.deferer)).then(() => item.value)

  return [item.value, broadcast, item.deferer]
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
    HOOKS_CHAIN.length = 0
    stop.value = run()
    HOSTS_CHAIN.length = 0
    HOOKS_CHAIN.length = 0
  }
  root.next = next

  stop.next = () => {
    // 还在进行中的，就不需要持续跟进
    if (!atom.end) {
      return
    }
    root.end = false
    return next()
  }

  next()

  return stop
}

/**
 * 清空些数据源的已有数据，解除绑定，避免内存泄露
 * @param {array|object} sources
 */
export function release(source, ...params) {
  if (isArray(source)) {
    source.forEach((source) => {
      source.atoms.forEach(traverseFree)
      source.atoms = []
    })
  }
  else if (!params.length) {
    release([source])
  }
  // 如果传入了参数，则根据参数清楚特定的信息
  else {
    const { atoms, value } = source
    const hash = getObjectHash(params)
    const atom = atoms.find(item => item.hash === hash)
    if (atom) {
      atom.value = value
      traverseFree(atom)
    }
  }
}


/**
 * 抓取，返回抓取的Promise，如果本地已经有了，那么就直接返回本地数据，如果本地没有，就抓取远端的
 * 一般只有第一次抓取才会花比较长时间，后续都是直接返回
 * @param {*} source
 * @param {...any} params
 * @returns
 */
export function fetch(source, ...params) {
  const [, , deferer] = query(source, ...params)
  return deferer
}

/**
 * 更新数据，在不需要获取数据的情况下，可以通过renew更新数据
 * @param {*} source
 * @param  {...any} params
 * @returns
 */
export function renew(source, ...params) {
  const [, renew] = query(source, ...params)
  // 会发出新的请求
  return renew()
}

// 普通函数 --------------------------------

/**
 * 判断一个值是否为source
 * @param {*} source
 * @returns {boolean}
 */
export function isSource(source) {
  const type = source && source.type
  if (!type) {
    return false
  }
  return [SOURCE_TYPES.ACTION, SOURCE_TYPES.COMPOSE, SOURCE_TYPES.SOURCE, SOURCE_TYPES.SETUP].includes(type)
}

/**
 * 获取数据，从仓库中直接获取（缓存）
 * @param {*} source
 * @param  {...any} params
 * @returns
 */
export function get(source, ...params) {
  const [data] = query(source, ...params)
  return data
}

/**
 * 将source退格为普通的ajax请求
 * @param {Source} source
 * @param  {...any} params
 * @returns {Promise}
 */
export function request(source, ...params) {
  const { type } = source

  if (type === SOURCE_TYPES.ACTION) {
    return Promise.resolve(source.act(...params))
  }

  if (type === SOURCE_TYPES.SOURCE) {
    return Promise.resolve(source.get(...params))
  }

  throw new Error(`[alegb]: request只能使用action和原子source，不能使用复合source`);
}

/**
 * 获取该 source 的 lifecycle 对象。
 * @param {*} source
 * @returns
 */
export function subscribe(source) {
  const event = source.event = source.event || new Event()
  return event
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
    return () => [value, () => Promise.resolve(value), Promise.resolve(value), new Event()]
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
