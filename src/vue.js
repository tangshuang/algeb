import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, get, isSource, subscribe } from 'algeb'

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

    const subscriber = subscribe(source, ...params)
    subscriber.on('beforeAffect', prepare)
    subscriber.on('afterAffect', done)
    subscriber.on('fail', fail)

    const stop = setup(function() {
      const [some, fetchAgain] = query(source, ...params)
      dataRef.value = some
      renew = fetchAgain
    })

    onUnmounted(() => {
      subscriber.off('beforeAffect', prepare)
      subscriber.off('afterAffect', done)
      subscriber.off('fail', fail)
      stop()
    })
  }

  return [data, (...args) => renew(...args), pending, error]
}
