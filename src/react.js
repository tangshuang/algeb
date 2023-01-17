import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { query, setup, isSource, affect } from 'algeb'
import { useShallowLatest } from './shallow-latest'
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

export function useSource(source, ...params) {
  const ref = useRef([source?.value, () => Promise.resolve(source?.value)])
  const args = useShallowLatest(params)
  const [loading, setLoading] = useState(false)

  const isUnmounted = useRef(false)
  useLayoutEffect(() => () => {
    isUnmounted.current = true
  }, [])

  useEffect(() => {
    if (!isSource(source)) {
      return
    }

    const stop = setup(() => {
      const [data, renew, lifecycle] = query(source, ...args)
      ref.current = [data, renew]
      affect(() => {
        const openLoading = () => {
          if (!isUnmounted.current) {
            setLoading(true)
          }
        }
        const closeLoading = () => {
          if (!isUnmounted.current) {
            setLoading(false)
          }
        }

        lifecycle.on('beforeFlush', openLoading)
        lifecycle.on('afterFlush', closeLoading)

        return () => {
          lifecycle.off('beforeFlush', openLoading)
          lifecycle.off('afterFlush', closeLoading)
        }
      }, [])
    })
    return stop
  }, [source, args])

  return [...ref.current, loading]
}
