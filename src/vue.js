import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, get, isSource, subscribe } from 'algeb'

export function useSource(source, ...params) {
  const pendingRef = ref(false)
  const pending = computed(() => pendingRef.value)
  const errorRef = ref(null)
  const error = computed(() => errorRef.value)

  if (isSource(source)) {
    const prepare = () => {
      errorRef.value = null
      pendingRef.value = true
    }
    const done = () => {
      pendingRef.value = false
    }
    const fail = (e) => {
      pendingRef.value = false
      errorRef.value = e
    }

    const subscriber = subscribe(source)
    subscriber.on('beforeAffect', prepare)
    subscriber.on('afterAffect', done)
    subscriber.on('fail', fail)

    onUnmounted(() => {
      subscriber.off('beforeAffect', prepare)
      subscriber.off('afterAffect', done)
      subscriber.off('fail', fail)
    })
  }

  const currentValue = isSource(source) ? get(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)
  let renew = () => Promise.resolve(data)

  if (isSource(source)) {
    const stop = setup(function() {
      const [some, fetchAgain] = query(source, ...params)
      dataRef.value = some
      renew = fetchAgain
    })
    onUnmounted(stop)
  }

  return [data, (...args) => renew(...args), pending, error]
}
