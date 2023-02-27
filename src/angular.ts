import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup, read, isSource, subscribe } from 'algeb'

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
    const currentValue = isSource(source) ? read(source, ...params) : source
    let renew = (...args) => Promise.resolve(currentValue)
    const scope = {
      pending: false,
      error: null,
      value: currentValue,
    }

    if (isSource(source)) {
      const prepare = () => {
        scope.error = null
        scope.pending = true
        this.detectorRef.detectChanges()
      }

      const fail = (e) => {
        scope.error = e
        scope.pending = false
        this.detectorRef.detectChanges()
      }

      const done = () => {
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

    if (isSource(source)) {
      const stop = setup(function() {
        const [some, fetchSome] = query(source, ...params)
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
