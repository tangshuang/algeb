import { query, setup, affect } from './index.js'

export function useSource(source, ...params) {
  return function($scope) {
    const scope = {
      value: source.value,
      loading: false,
    }

    let renew = null

    const destroy = setup(function() {
      const [some, fetchSome, lifecycle] = query(source, ...params)
      scope.value = some
      renew = fetchSome
      affect(() => {
        const openLoading = () => {
          scope.loading = true
          $scope.$apply()
        }
        const closeLoading = () => {
          scope.loading = false
          $scope.$apply()
        }

        lifecycle.on('beforeFlush', openLoading)
        lifecycle.on('afterFlush', closeLoading)

        return () => {
          lifecycle.off('beforeFlush', openLoading)
          lifecycle.off('afterFlush', closeLoading)
        }
      }, [])
      $scope.$apply()
    })

    $scope.$on('$destroy', destroy)

    return [scope, renew]
  }
}
