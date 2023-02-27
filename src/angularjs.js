import { query, setup, read, isSource, subscribe } from 'algeb'

export function useSource(source, ...params) {
  return function($scope) {
    const currentValue = isSource(source) ? read(source, ...params) : source
    let renew = () => Promise.resolve(currentValue)
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

      const subscriber = subscribe(source)
      subscriber.on('beforeAffect', prepare)
      subscriber.on('afterAffect', done)
      subscriber.on('fail', fail)

      $scope.$on('$destroy', () => {
        subscriber.off('beforeAffect', prepare)
        subscriber.off('afterAffect', done)
        subscriber.off('fail', fail)
      })
    }

    if (isSource(source)) {
      const stop = setup(function() {
        const [some, fetchAgain] = query(source, ...params)
        scope.value = some
        renew = fetchAgain
        $scope.$applyAsync()
      })

      $scope.$on('$destroy', stop)
    }

    return [scope, (...args) => renew(...args)]
  }
}
