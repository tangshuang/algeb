import { useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react'
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
  const [pending, setPending] = useState(false)
  const forceUpdate = useForceUpdate()
  const [error, setError] = useState(null)

  const isUnmounted = useRef(false)
  useLayoutEffect(() => () => {
    isUnmounted.current = true
  }, [])

  const lifecycle = useMemo(() => {
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
    const fail = (e) => {
      if (!isUnmounted.current) {
        setError(e)
        setPending(false)
        forceUpdate()
      }
    }

    const subscriber = subscribe(source)
    subscriber.on('beforeAffect', prepare)
    subscriber.on('afterAffect', done)
    subscriber.on('fail', fail)

    return { subscriber, prepare, done, fail }
  }, [source])

  useEffect(() => {
    return () => {
      if (lifecycle) {
        const { subscriber, prepare, done, fail } = lifecycle
        subscriber.off('beforeAffect', prepare)
        subscriber.off('afterAffect', done)
        subscriber.off('fail', fail)
      }
    }
  }, [lifecycle])

  const args = useShallowLatest(params)
  const currentValue = isSource(source) ? get(source, ...params) : source
  const [data, setData] = useState(currentValue)
  const renewRef = useRef(() => Promise.resolve(currentValue))

  useEffect(() => {
    if (!isSource(source)) {
      return
    }

    const stop = setup(() => {
      const [data, renew] = query(source, ...args)
      setData(data)
      renewRef.current = renew
    })

    return stop
  }, [source, args])

  return [data, renewRef.current, pending, error]
}
