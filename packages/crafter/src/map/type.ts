import { IType } from '../lib/IType'
import { isLeafType } from '../lib/LeafType'
import { NodeType } from '../lib/NodeType'
import { MapInstance } from './instance'
import { IContainer } from '../IContainer'
import { isInstance } from '../lib'

export class MapType<K, TYPE> extends NodeType<
  Map<K, TYPE>,
  Map<K, TYPE> | [K, TYPE][]
> {
  public itemType: IType<TYPE, TYPE>
  public isNode: true = true

  constructor(itemType: IType<TYPE>) {
    super()
    this.itemType = itemType
  }

  public create(values?: any, options?: {id?: string, context?: IContainer}): any {
    return new MapInstance<any, any>(this, values, options)
  }

  public isValidSnapshot(value: any): value is Map<K, TYPE> {
    if (isInstance(value)) {
      return false
    } 
    if (isLeafType(this.itemType) && this.itemType.typeFlag === 'unknown') {
      return true
    }
    if (value instanceof Map) {
      return [...value.values()].every(this.itemType.isValidSnapshot)
    } else if (Array.isArray(value)) {
      return value.every(entry => this.itemType.isValidSnapshot(entry[1]))
    } else return false
  }

  public isValidValue(value: any): value is Map<K, TYPE> {
    return isInstance(value)
      ? value.$type === this && [...value.$data.values()].every(this.itemType.isValidValue)
      : this.isValidSnapshot(value)
  }
}
