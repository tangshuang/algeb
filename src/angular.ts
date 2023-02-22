import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup, affect, get, isSource, subscribe } from 'algeb'

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

    let renew = (...args) => Promise.resolve(currentValue)

    if (isSource(source)) {
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

      const subscriber = subscribe(source, ...params)
      subscriber.on('beforeAffect', prepare)
      subscriber.on('afterAffect', done)
      subscriber.on('fail', fail)

      const stop = setup(function() {
        const [some, fetchSome, , lifecycle] = query(source, ...params)
        scope.value = some
        renew = fetchSome
        this.detectorRef.detectChanges()
      })

      this.destroies.push(() => {
        subscriber.off('beforeAffect', prepare)
        subscriber.off('afterAffect', done)
        subscriber.off('fail', fail)
        stop()
      })
    }

    return [scope, (...args) => renew(...args)]
  }

  ngOnDestroy() {
    this.destroies.forEach(destroy => destroy())
    this.destroies.length = 0
  }
}
