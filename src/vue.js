import { shallowRef, computed, onUnmounted, ref } from 'vue'
import { query, setup, read, isSource, subscribe } from 'algeb'

const createUseSource = (lazy) => (source, ...params) => {
  const currentValue = isSource(source) ? read(source, ...params) : source
  const dataRef = shallowRef(currentValue)
  const data = computed(() => dataRef.value)

  let renew = () => Promise.resolve(data)
  let renewFn = (...args) => renew(...args)

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
      renew = fetchAgain
      dataRef.value = some
    }, { lifecycle, lazy })

    onUnmounted(() => {
      stop()
      lifecycle.off('beforeAffect', prepare)
      lifecycle.off('afterAffect', done)
      lifecycle.off('fail', fail)
    })

    if (lazy) {
      renewFn = (...args) => {
        if (stop.start) {
          return stop.start()
        }
        return renew(...args)
      }
    }
  }

  return [data, renewFn, pending, error]
}

export const useSource = createUseSource()
export const useLazySource = createUseSource(true)
