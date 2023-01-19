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
          const openLoading = () => {
            scope.loading = true
            $scope.$applyAsync()
          }
          const closeLoading = () => {
            scope.loading = false
            $scope.$applyAsync()
          }

          lifecycle.on('beforeFlush', openLoading)
          lifecycle.on('afterAffect', closeLoading)

          return () => {
            lifecycle.off('beforeFlush', openLoading)
            lifecycle.off('afterAffect', closeLoading)
          }
        }, [])
        $scope.$applyAsync()
      })

      $scope.$on('$destroy', stop)
    }

    return [scope, renew]
  }
}
