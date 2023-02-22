import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { query, setup, isSource, get, subscribe } from 'algeb'
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
  const [pending, setPending] = useState(false)
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

    const prepare = () => {
      if (!isUnmounted.current) {
        setError(null)
        setPending(true)
        forceUpdate()
      }
    }
    const done = () => {
      if (!isUnmounted.current) {
        setPending(false)
        forceUpdate()
      }
    }
    const fail = (error) => {
      if (!isUnmounted.current) {
        setError(error)
        setPending(false)
        forceUpdate()
      }
    }

    const subscriber = subscribe(source, ...params)
    subscriber.on('beforeAffect', prepare)
    subscriber.on('afterAffect', done)
    subscriber.on('fail', fail)

    const stop = setup(() => {
      const [data, renew] = query(source, ...args)
      ref.current = [data, renew]
    })

    return () => {
      subscriber.off('beforeAffect', prepare)
      subscriber.off('afterAffect', done)
      subscriber.off('fail', fail)
      stop()
    }
  }, [source, args])

  return [...ref.current, pending, error]
}
