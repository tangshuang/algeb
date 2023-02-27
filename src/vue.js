import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, read, isSource, subscribe } from 'algeb'

export function useSource(source, ...params) {
  const currentValue = isSource(source) ? read(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)
  let renew = () => Promise.resolve(data)

  const pendingRef = ref(false)
  const pending = computed(() => pendingRef.value)
  const errorRef = ref(null)
  const error = computed(() => errorRef.value)

  if (isSource(source)) {
    const prepare = () => {
      pendingRef.value = true
      errorRef.value = null
    }

    const fail = (e) => {
      pendingRef.value = false
      errorRef.value = e
    }

    const done = () => {
      pendingRef.value = false
    }

    const lifecycle = subscribe(source)
    lifecycle.on('beforeAffect', prepare)
    lifecycle.on('afterAffect', done)
    lifecycle.on('fail', fail)

    const stop = setup(function() {
      const [some, fetchAgain] = query(source, ...params)
      dataRef.value = some
      renew = fetchAgain
    }, { lifecycle })

    onUnmounted(() => {
      stop()
      lifecycle.off('beforeAffect', prepare)
      lifecycle.off('afterAffect', done)
      lifecycle.off('fail', fail)
    })
  }

  return [data, (...args) => renew(...args), pending, error]
}
