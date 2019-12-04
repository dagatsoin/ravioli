import { setNonEnumerable } from '../setNonEnumerable'
import { IInstance } from './IInstance'
import { Instance } from './Instance'
import { IType } from './IType'

export class LeafInstance<T> extends Instance<T, T> {
  public $data: any
  public $type: IType<T>
  constructor(type: IType<T>, value: T) {
    super()
    this.$data = value
    this.$type = type
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
  }
  get $snapshot(): T {
    return this.$data
  }
  get $value(): T {
    return this.$data
  }
  public $setValue(value: T): void {
    // don't even validate this value. It is entirly the dev fault ><
    this.$data = value
  }
}

export function getLeafInstance(parent: IInstance<any>, key: string) {
  return parent.$data[key]
}
