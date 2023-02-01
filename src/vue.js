import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, affect, get, isSource } from 'algeb'

export function useSource(source, ...params) {
  const currentValue = isSource(source) ? get(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)
  const loadingRef = ref(false)
  const loading = computed(() => loadingRef.value)
  const errorRef = ref(null)
  const error = computed(() => errorRef.value)

  let renew = () => Promise.resolve(data)

  if (isSource(source)) {
    const stop = setup(function() {
      const [some, fetchSome, , lifecycle] = query(source, ...params)
      dataRef.value = some
      renew = fetchSome
      affect(() => {
        const prepare = () => {
          errorRef.value = null
          loadingRef.value = true
        }
        const done = () => {
          loadingRef.value = false
        }
        const fail = (error) => {
          loadingRef.value = false
          errorRef.value = error
        }

        lifecycle.on('beforeAffect', prepare)
        lifecycle.on('afterAffect', done)
        lifecycle.on('fail', fail)

        return () => {
          lifecycle.off('beforeAffect', prepare)
          lifecycle.off('afterAffect', done)
          lifecycle.off('fail', fail)
        }
      }, [])
    })

    onUnmounted(stop)
  }

  return [data, renew, loading, error]
}
