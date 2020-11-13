import { query, setup } from './index.js'

export function useQuery(src, ...params) {
  return function($scope) {
    const data = { value: src.value }
    let fn = null

    const destroy = setup(function() {
      const [some, fetchSome] = query(src, ...params)
      data.value = some
      fn = fetchSome
      $scope.$apply()
    })

    $scope.$on('$destroy', destroy)

    return [data, fn]
  }
}
