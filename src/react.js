import { useState, useEffect, useRef } from 'react'
import { query, setup } from './index.js'

export function useQuery(src, ...params) {
  const [data, update] = useState(src.value)
  const fn = useRef(null)

  useEffect(() => {
    return setup(function() {
      const [some, fetchSome] = query(src, ...params)
      update(some)
      fn.current = fetchSome
    })
  }, [src, ...params])

  return [data, () => fn.current()]
}
