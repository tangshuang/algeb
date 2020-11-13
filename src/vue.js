import { shallowRef, computed, onUnmounted } from 'vue'
import { query, setup } from './index.js'

export function useQuery(src, ...params) {
  const src = shallowRef(src.value)
  const data = computed(() => src.value)
  let fn = null

  const destroy = setup(function() {
    const [some, fetchSome] = query(src, ...params)
    src.value = some
    fn = fetchSome
  })

  onUnmounted(destroy)

  return [data, fn]
}
