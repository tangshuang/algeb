import { getObjectHash, isEqual, throttle } from 'ts-fns'

const CELL_TYPES = {
  SOURCE: 1,
  COMPOSE: 2,
  SETUP: 3,
}

const HOSTS_CHAIN = []
const HOOKS_CHAIN = []

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
  const cell = {
    type: CELL_TYPES.COMPOSE,
    get,
    atoms: [],
  }
  return cell
}

export function query(cell, ...params) {
  const { type } = cell
  if (type === CELL_TYPES.SOURCE) {
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
        atom.hosts.forEach((host) => {
          host.next()
        })
      })
    }, 16)

    const item = atom || { hash, next, hosts: [] }
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
      atom.hosts.forEach((host) => {
        host.next()
      })
    }, 16)

    const emit = throttle(() => {
      const atom = atoms.find(item => item.hash === hash)
      // host will recompute/popagate in dep.next, so we do not need to do `next` any more
      atom.deps.map(dep => dep.next())
    }, 16)

    const item = atom || { hash, next, emit, deps: [], hosts: [], hooks: [] }
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
  const atom = { deps: [], hooks: [], next: run }
  HOSTS_CHAIN.push(atom)
  run()
  HOSTS_CHAIN.pop()
  HOOKS_CHAIN.length = 0 // clear hooks list
}

// hooks -------------

export function affect(invoke, deps) {
  const host = HOSTS_CHAIN[HOSTS_CHAIN.length - 1]
  const index = HOOKS_CHAIN.length

  HOOKS_CHAIN.push(1)

  const hook = host.hooks[index]
  if (hook) {
    if ((!deps && !hook.deps) || !isEqual(deps, hook.deps)) {
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
