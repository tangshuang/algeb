import { useEffect, useRef, useState, useMemo } from 'react'
import { query, setup, isSource, subscribe, read } from 'algeb'
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
  const args = useShallowLatest(params)
  const currentValue = isSource(source) ? read(source, ...params) : source
  const valueRef = useRef(currentValue)
  const renewRef = useRef(() => Promise.resolve(currentValue))

  const pendingRef = useRef(false)
  const errorRef = useRef(null)

  const forceUpdate = useForceUpdate()

  const isMounted = useRef(false)
  const isUnmounted = useRef(false)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isUnmounted.current = true
    }
  }, [])

  const disconnect = useMemo(() => {
    if (!isSource(source)) {
      return
    }

    const prepare = () => {
      pendingRef.current = true
      errorRef.current = null
      if (isMounted.current && !isUnmounted.current) {
        forceUpdate()
      }
    }

    const fail = (e) => {
      pendingRef.current = false
      errorRef.current = e
      if (isMounted.current && !isUnmounted.current) {
        forceUpdate()
      }
    }

    const done = () => {
      pendingRef.current = false
      if (isMounted.current && !isUnmounted.current) {
        forceUpdate()
      }
    }

    const lifecycle = subscribe()
    lifecycle.on('beforeAffect', prepare)
    lifecycle.on('afterAffect', done)
    lifecycle.on('fail', fail)

    const stop = setup(() => {
      const [data, renew] = query(source, ...args)
      valueRef.current = data
      renewRef.current = renew
      if (isMounted.current && !isUnmounted.current) {
        forceUpdate()
      }
    }, { lifecycle })

    return () => {
      stop()
      lifecycle.off('beforeAffect', prepare)
      lifecycle.off('afterAffect', done)
      lifecycle.off('fail', fail)
    }
  }, [source, args])

  useEffect(() => {
    return disconnect
  }, [source, args, disconnect])

  return [valueRef.current, renewRef.current, pendingRef.current, errorRef.current]
}
