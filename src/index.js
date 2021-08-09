import { getObjectHash, isEqual, throttle } from 'ts-fns'

const CELL_TYPES = {
  SOURCE: 1,
  COMPOSE: 2,
  SETUP: 3,
}

const HOSTS_CHAIN = []
const HOOKS_CHAIN = []

let isGettingComposeValue = false

export function source(get, value) {
  const cell = {
    type: CELL_TYPES.SOURCE,
    get,
    value,
    atoms: [],
  }
  return cell
}

export function compose(get) {
  isGettingComposeValue = true
  const value = get()
  isGettingComposeValue = false
  const cell = {
    type: CELL_TYPES.COMPOSE,
    get,
    atoms: [],
    value,
  }
  return cell
}

export function query(cell, ...params) {
  const { type, value } = cell
  if (isGettingComposeValue) {
    return [value]
  }
  else if (type === CELL_TYPES.SOURCE) {
    return querySource(cell, ...params)
  }
  else if (type === CELL_TYPES.COMPOSE) {
    return queryCompose(cell, ...params)
  }
}

function querySource(cell, ...params) {
  const { atoms, value, get } = cell
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    return 'value' in atom ? [atom.value, atom.next] : [value, atom.next]
  }
  else {
    const next = throttle(() => {
      const atom = atoms.find(item => item.hash === hash)
      if (atom.deferer) {
        return
      }

      atom.deferer = Promise.resolve().then(() => get(...params)).then((value) => {
        atom.value = value
        // reset
        atom.deferer = null
        // recompute
        atom.hosts.forEach((host, i) => {
          if (host.end) { // the host is destoryed
            atom.hosts.splice(i, 1)
          }
          else {
            host.next()
          }
        })
      })
    }, 16)

    const item = atom || { hash, next, hosts: [], cell }
    const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]

    if (!atom) {
      atoms.push(item)
    }

    if (host) {
      host.deps.push(item)
      item.hosts.push(host)
    }

    next()

    return [value, next]
  }
}

function queryCompose(cell, ...params) {
  const { atoms, get } = cell
  const hash = getObjectHash(params)
  const atom = atoms.find(item => item.hash === hash)

  if (atom) {
    return [atom.value, atom.emit]
  }
  else {
    const compute = (atom) => {
      HOSTS_CHAIN.push(atom)
      const value = get(...params)
      atom.value = value
      HOSTS_CHAIN.pop()
      HOOKS_CHAIN.length = 0 // clear hooks list
    }

    const next = throttle(() => {
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
    }, 16)

    const emit = throttle((...cells) => {
      const atom = atoms.find(item => item.hash === hash)
      // host will recompute/popagate in dep.next, so we do not need to do `next` any more
      const deps = cells.length ? atom.deps.filter(dep => cells.includes(dep.cell)) : atom.deps
      deps.map(dep => dep.next())
    }, 16)

    const item = atom || { hash, next, emit, deps: [], hosts: [], hooks: [], cell }
    const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]

    if (!atom) {
      atoms.push(item)
    }

    compute(item)

    if (host) {
      host.deps.push(item)
      item.hosts.push(host)
    }

    return [item.value, emit]
  }
}

export function setup(run) {
  const atom = { deps: [], hooks: [] }
  let res = null
  const next = () => {
    HOSTS_CHAIN.push(atom)
    res = run()
    // HOSTS_CHAIN.pop()
    HOOKS_CHAIN.length = 0 // clear hooks list
  }
  atom.next = next
  next()
  const context = {
    stop: () => {
      atom.end = true
    },
    start: () => {
      if (!atom.end) {
        return
      }
      atom.end = false
      next()
    },
    get value() {
      return res
    },
  }
  return context
}

// hooks -------------

export function affect(invoke, deps) {
  if (isGettingComposeValue) {
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
  if (isGettingComposeValue) {
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
  if (isGettingComposeValue) {
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
    const cell = source(get, value)
    const next = (...args) => query(cell, ...args)
    const hook = { query: next }
    host.hooks[index] = hook
    return next
  }
}

export function ref(value) {
  if (isGettingComposeValue) {
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
