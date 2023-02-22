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
    const scope = {
      pending: false,
      error: null,
    }

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
      const fail = (e) => {
        scope.error = e
        scope.pending = false
        this.detectorRef.detectChanges()
      }

      const subscriber = subscribe(source)
      subscriber.on('beforeAffect', prepare)
      subscriber.on('afterAffect', done)
      subscriber.on('fail', fail)

      this.destroies.push(() => {
        subscriber.off('beforeAffect', prepare)
        subscriber.off('afterAffect', done)
        subscriber.off('fail', fail)
      })
    }

    const currentValue = isSource(source) ? get(source, ...params) : source
    scope.value = currentValue
    let renew = (...args) => Promise.resolve(currentValue)

    if (isSource(source)) {
      const stop = setup(function() {
        const [some, fetchSome, , lifecycle] = query(source, ...params)
        scope.value = some
        renew = fetchSome
        this.detectorRef.detectChanges()
      })

      this.destroies.push(stop)
    }

    return [scope, (...args) => renew(...args)]
  }

  ngOnDestroy() {
    this.destroies.forEach(destroy => destroy())
    this.destroies.length = 0
  }
}
