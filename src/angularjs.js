import { query, setup, isSource, subscribe } from 'algeb'

export function useSource(source, ...params) {
  return function($scope) {
    const currentValue = isSource(source) ? get(source, ...params) : source

    const scope = {
      value: currentValue,
      pending: false,
      error: null,
    }

    let renew = () => Promise.resolve(currentValue)

    if (isSource(source)) {
      const prepare = () => {
        scope.error = null
        scope.pending = true
        $scope.$applyAsync()
      }
      const done = () => {
        scope.pending = false
        $scope.$applyAsync()
      }
      const fail = (error) => {
        scope.error = error
        scope.pending = false
        $scope.$applyAsync()
      }

      const subscriber = subscribe(source, ...params)
      subscriber.on('beforeAffect', prepare)
      subscriber.on('afterAffect', done)
      subscriber.on('fail', fail)

      const stop = setup(function() {
        const [some, fetchSome, , lifecycle] = query(source, ...params)
        scope.value = some
        renew = fetchSome
        $scope.$applyAsync()
      })

      $scope.$on('$destroy', () => {
        subscriber.off('beforeAffect', prepare)
        subscriber.off('afterAffect', done)
        subscriber.off('fail', fail)
        stop()
      })
    }

    return [scope, (...args) => renew(...args)]
  }
}
