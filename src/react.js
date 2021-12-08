import { useState, useEffect, useRef } from 'react'
import { query, setup } from './index.js'

export function useQuery(source, ...params) {
  const [data, update] = useState(source.value)
  const fn = useRef(null)

  useEffect(() => {
    return setup(function() {
      const [some, fetchSome] = query(source, ...params)
      update(some)
      fn.current = fetchSome
    })
  }, [source, ...params])

  return [data, () => fn.current()]
}
