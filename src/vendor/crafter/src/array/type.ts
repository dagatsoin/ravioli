import { IType } from '../lib/IType'
import { isLeafType } from '../lib/LeafType'
import { NodeType } from '../lib/NodeType'
import { Type } from '../lib/Type'
import { ArrayInstance } from './instance'

export class ArrayType<T> extends NodeType<T[]> {
  public itemType: Type<T>
  public isNode: true = true

  constructor(itemType: IType<T>) {
    super()
    this.itemType = itemType
  }

  public create(value?: T[] | ArrayInstance<T>, id?: string): T[] {
    return new ArrayInstance<T>(this, value || [], id)
  }

  public isValidValue(value: any): value is T[] {
    return (
      (isLeafType(this.itemType) && this.itemType.type === 'unknown') ||
      (!!value &&
        Array.isArray(value) &&
        value.every(this.itemType.isValidValue))
    )
  }
}
