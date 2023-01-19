import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, affect, get, isSource } from 'algeb'

export function useSource(source, ...params) {
  const currentValue = isSource(source) ? get(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)
  const loadingRef = ref(false)
  const loading = computed(() => loadingRef.value)

  let renew = () => Promise.resolve(data)

  if (isSource(source)) {
    const stop = setup(function() {
      const [some, fetchSome, , lifecycle] = query(source, ...params)
      dataRef.value = some
      renew = fetchSome
      affect(() => {
        const openLoading = () => {
          loadingRef.value = true
        }
        const closeLoading = () => {
          loadingRef.value = false
        }

        lifecycle.on('beforeFlush', openLoading)
        lifecycle.on('afterAffect', closeLoading)

        return () => {
          lifecycle.off('beforeFlush', openLoading)
          lifecycle.off('afterAffect', closeLoading)
        }
      }, [])
    })

    onUnmounted(stop)
  }

  return [data, renew, loading]
}
