import { query, setup } from './index.js'

export function useQuery(source, ...params) {
  return function($scope) {
    const data = { value: source.value }
    let fn = null

    const destroy = setup(function() {
      const [some, fetchSome] = query(source, ...params)
      data.value = some
      fn = fetchSome
      $scope.$apply()
    })

    $scope.$on('$destroy', destroy)

    return [data, fn]
  }
}
