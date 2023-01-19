import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { query, setup, isSource, affect, get } from './index.js'
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
  const currentValue = get(source, ...params)
  const ref = useRef([currentValue, () => Promise.resolve(currentValue)])

  const args = useShallowLatest(params)
  const [loading, setLoading] = useState(false)
  const forceUpdate = useForceUpdate()

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
        const openLoading = () => {
          if (!isUnmounted.current) {
            setLoading(true)
            forceUpdate()
          }
        }
        const closeLoading = () => {
          if (!isUnmounted.current) {
            setLoading(false)
            forceUpdate()
          }
        }

        lifecycle.on('beforeFlush', openLoading)
        lifecycle.on('afterAffect', closeLoading)

        return () => {
          lifecycle.off('beforeFlush', openLoading)
          lifecycle.off('afterAffect', closeLoading)
        }
      }, [])
    })
    return stop
  }, [source, args])

  return [...ref.current, loading]
}
