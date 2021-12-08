import { shallowRef, computed, onUnmounted } from 'vue'
import { query, setup } from './index.js'

export function useQuery(source, ...params) {
  const source = shallowRef(source.value)
  const data = computed(() => source.value)
  let fn = null

  const destroy = setup(function() {
    const [some, fetchSome] = query(source, ...params)
    source.value = some
    fn = fetchSome
  })

  onUnmounted(destroy)

  return [data, fn]
}
