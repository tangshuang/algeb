import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup, affect, get, isSource } from 'algeb'

interface Source {
  value: any,
}

@Injectable({
  provideIn: 'root',
})
export class Algeb {
  private destroies: Function[] = []

  constructor(private detectorRef:ChangeDetectorRef) {}

  useSource(source:Source, ...params:any[]) {
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
            this.detectorRef.detectChanges()
          }
          const closeLoading = () => {
            scope.loading = false
            this.detectorRef.detectChanges()
          }

          lifecycle.on('beforeFlush', openLoading)
          lifecycle.on('afterAffect', closeLoading)

          return () => {
            lifecycle.off('beforeFlush', openLoading)
            lifecycle.off('afterAffect', closeLoading)
          }
        }, [])
        this.detectorRef.detectChanges()
      })
      this.destroies.push(stop)
    }

    return [scope, renew]
  }

  ngOnDestroy() {
    this.destroies.forEach(destroy => destroy())
    this.destroies.length = 0
  }
}
