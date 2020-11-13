import { Injectable, ChangeDetectorRef } from '@angular/core'
import { query, setup } from './index.js'

interface Source {
  type:number,
  value:unknown,
  atoms:[],
  [key:string]:unknown
}

@Injectable({
  provideIn: 'root',
})
export class Algeb {
  private destroies = []

  constructor(private detectorRef:ChangeDetectorRef) {}

  useQuery(src:Source, ...params:any[]) {
    const data = { value: src.value }
    let fn:Function

    const destroy = setup(function() {
      const [some, fetchSome] = query(src, ...params)
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
