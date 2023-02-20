import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, affect, get, isSource } from 'algeb'

export function useSource(source, ...params) {
  const currentValue = isSource(source) ? get(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)
  const pendingRef = ref(false)
  const pending = computed(() => pendingRef.value)
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
          pendingRef.value = true
        }
        const done = () => {
          pendingRef.value = false
        }
        const fail = (error) => {
          pendingRef.value = false
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

  return [data, renew, pending, error]
}
