import { query, setup, affect } from 'algeb'

export function useSource(source, ...params) {
  return function($scope) {
    const currentValue = get(source, ...params)

    const scope = {
      value: currentValue,
      loading: false,
    }

    let renew = null

    const destroy = setup(function() {
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

    $scope.$on('$destroy', destroy)

    return [scope, renew]
  }
}
