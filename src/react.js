import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { query, setup, isSource, affect, get } from 'algeb'
import { isShallowEqual, isArray, isObject } from 'ts-fns'

function useShallowLatest(obj) {
  const used = useRef(false)
  const latest = useRef(obj)

  if (used.current && !isShallowEqual(latest.current, obj, 1)) {
    latest.current = isArray(obj) ? [...obj]
      : isObject(obj) ? { ...obj }
      : obj
  }

  if (!used.current) {
    used.current = true
  }

  return latest.current
}

function useForceUpdate() {
  const [, forceUpdate] = useState({});
  return () => forceUpdate({});
}

export function useSource(source, ...params) {
  const currentValue = isSource(source) ? get(source, ...params) : source
  const ref = useRef([currentValue, () => Promise.resolve(currentValue)])

  const args = useShallowLatest(params)
  const [pending, setpending] = useState(false)
  const forceUpdate = useForceUpdate()
  const [error, setError] = useState(null)

  const isUnmounted = useRef(false)
  useLayoutEffect(() => () => {
    isUnmounted.current = true
  }, [])

  useEffect(() => {
    if (!isSource(source)) {
      return
    }

    const stop = setup(() => {
      const [data, renew, , lifecycle] = query(source, ...args)
      ref.current = [data, renew]
      affect(() => {
        const prepare = () => {
          if (!isUnmounted.current) {
            setError(null)
            setpending(true)
            forceUpdate()
          }
        }
        const done = () => {
          if (!isUnmounted.current) {
            setpending(false)
            forceUpdate()
          }
        }
        const fail = (error) => {
          if (!isUnmounted.current) {
            setError(error)
            setpending(false)
            forceUpdate()
          }
        }

        lifecycle.on('beforeAffect', prepare)
        lifecycle.on('afterAffect', done)
        lifecycle.on('fail', fail)

        return () => {
          lifecycle.off('beforeAffect', prepare)
          lifecycle.off('afterAffect', done)
          lifecycle.off('fail', fail)
        }
      }, [])
    })
    return stop
  }, [source, args])

  return [...ref.current, pending, error]
}
