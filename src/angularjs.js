import { query, setup, affect, isSource } from 'algeb'

export function useSource(source, ...params) {
  return function($scope) {
    const currentValue = isSource(source) ? get(source, ...params) : source

    const scope = {
      value: currentValue,
      loading: false,
    }

    let renew = () => Promise.resolve(currentValue)

    if (isSource(source)) {
      const stop = setup(function() {
        const [some, fetchSome, , lifecycle] = query(source, ...params)
        scope.value = some
        renew = fetchSome
        affect(() => {
          const prepare = () => {
            scope.error = null
            scope.loading = true
            $scope.$applyAsync()
          }
          const done = () => {
            scope.loading = false
            $scope.$applyAsync()
          }
          const fail = (error) => {
            scope.error = error
            scope.loading = false
            $scope.$applyAsync()
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
        $scope.$applyAsync()
      })

      $scope.$on('$destroy', stop)
    }

    return [scope, renew]
  }
}
