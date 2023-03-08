import { query, setup, read, isSource, subscribe } from 'algeb'

const createUseSource = (lazy) => (source, ...params) => ($scope) => {
  const currentValue = isSource(source) ? read(source, ...params) : source

  let renew = () => Promise.resolve(currentValue)
  let renewFn = renew

  const scope = {
    pending: false,
    error: null,
  }

  if (isSource(source)) {
    const prepare = () => {
      scope.error = null
      scope.pending = true
      $scope.$applyAsync()
    }

    const fail = (e) => {
      scope.error = e
      scope.pending = false
      $scope.$applyAsync()
    }

    const done = () => {
      scope.pending = false
      $scope.$applyAsync()
    }

    const lifecycle = subscribe()
    lifecycle.on('beforeAffect', prepare)
    lifecycle.on('afterAffect', done)
    lifecycle.on('fail', fail)

    $scope.$on('$destroy', () => {
      lifecycle.off('beforeAffect', prepare)
      lifecycle.off('afterAffect', done)
      lifecycle.off('fail', fail)
    })

    const stop = setup(function() {
      const [some, fetchAgain] = query(source, ...params)
      scope.value = some
      renew = fetchAgain
      $scope.$applyAsync()
    }, { lifecycle, lazy })

    $scope.$on('$destroy', stop)

    if (lazy) {
      renewFn = (...args) => {
        if (stop.start) {
          return stop.start()
        }
        return renew(...args)
      }
    }
  }

  return [scope, renew]
}

export const useSource = createUseSource()
export const useLazySource = createUseSource(true)
