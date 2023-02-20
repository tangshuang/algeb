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
      pending: false,
      error: null,
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
            scope.pending = true
            this.detectorRef.detectChanges()
          }
          const done = () => {
            scope.pending = false
            this.detectorRef.detectChanges()
          }
          const fail = (error) => {
            scope.error = error
            scope.pending = false
            this.detectorRef.detectChanges()
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
