import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup } from './index.js'

interface Source {
  value: any,
}

@Injectable({
  provideIn: 'root',
})
export class Algeb {
  private destroies = []

  constructor(private detectorRef:ChangeDetectorRef) {}

  useQuery(source:Source, ...params:any[]) {
    const data = { value: source.value }
    let fn:Function

    const destroy = setup(function() {
      const [some, fetchSome] = query(source, ...params)
      data.value = some
      fn = fetchSome
      this.detectorRef.detectChanges()
    })

    this.destroies.push(destroy)

    return [data, fn]
  }

  ngOnDestroy() {
    this.destroies.forEach(destroy => destroy())
    this.destroies.length = 0
  }
}
