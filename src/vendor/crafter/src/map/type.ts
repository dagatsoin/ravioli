import { IType } from '../lib/IType'
import { isLeafType } from '../lib/LeafType'
import { NodeType } from '../lib/NodeType'
import { Type } from '../lib/Type'
import { MapInstance } from './instance'

export class MapType<K, T> extends NodeType<Map<K, T>> {
  public itemType: Type<T>
  public isNode: true = true

  constructor(itemType: IType<T>) {
    super()
    this.itemType = itemType
  }

  public create(
    values?: Array<[K, T]> | Map<K, T> | MapInstance<any, any>,
    id?: string
  ): Map<K, T> {
    return new MapInstance<any, any>(this, values, id)
  }

  public isValidValue(value: any): value is Map<K, T> {
    if (isLeafType(this.itemType) && this.itemType.type === 'unknown') {
      return true
    }
    if (value instanceof Map) {
      return [...value.values()].every(this.itemType.isValidValue)
    } else if (Array.isArray(value)) {
      return value.every(entry => this.itemType.isValidValue(entry[1]))
    } else return false
  }
}
