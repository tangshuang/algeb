import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup, read, isSource, subscribe } from 'algeb'

interface Source {
  value: any,
}

const createUseSource = (lazy?: boolean) => function(source:Source, ...params:any[]) {
  const currentValue = isSource(source) ? read(source, ...params) : source

  let renew = (...args) => Promise.resolve(currentValue)
  let renewFn = renew

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

    // @ts-ignore
    const lifecycle = subscribe()
    lifecycle.on('beforeAffect', prepare)
    lifecycle.on('afterAffect', done)
    lifecycle.on('fail', fail)

    this.destroies.push(() => {
      lifecycle.off('beforeAffect', prepare)
      lifecycle.off('afterAffect', done)
      lifecycle.off('fail', fail)
    })

    const stop = setup(function() {
      const [some, fetchSome] = query(source, ...params) as any[]
      scope.value = some
      renew = fetchSome
      this.detectorRef.detectChanges()
    }, { lifecycle, lazy })

    this.destroies.push(stop)

    if (lazy) {
      renewFn = (...args) => {
        // @ts-ignore
        if (stop.start) {
          // @ts-ignore
          return stop.start()
        }
        return renew(...args)
      }
    }
  }

  return [scope, renewFn]
}

@Injectable({
  provideIn: 'root',
})
export class Algeb {
  private destroies: Function[] = []

  constructor(private detectorRef:ChangeDetectorRef) {}

  useSource(source, ...params) {}
  useLazySource(source, ...params) {}

  ngOnDestroy() {
    this.destroies.forEach(destroy => destroy())
    this.destroies.length = 0
  }
}

Algeb.prototype.useSource = createUseSource()
Algeb.prototype.useLazySource = createUseSource(true)
