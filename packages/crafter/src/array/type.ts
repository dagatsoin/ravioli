import { IFactory } from '../lib/IFactory'
import { IType } from '../lib/IType'
import { NodeType } from '../lib/NodeType'
import { ArrayInstance } from './instance'
import { IContainer } from '../IContainer'
import { isUnknownType } from '../Primitive'
import { isInstance } from '../lib/Instance'

export class ArrayType<TYPE> extends NodeType<TYPE[], TYPE[]> {
  public itemType: IType<TYPE>
  public isNode: true = true

  constructor(itemFactory: IFactory<TYPE>) {
    super()
    this.itemType = itemFactory as IType<TYPE>
  }

  public create(value?: TYPE[], options?: {id?: string, context?: IContainer}): any {
    return new ArrayInstance<TYPE>(this, value || [], options)
  }

  public isValidSnapshot(value: any): value is TYPE[] {
    if (isInstance(value)) {
      return false
    }
    return (
      isUnknownType(this.itemType) ||
      (!!value &&
        Array.isArray(value) &&
        value.every(this.itemType.isValidSnapshot))
    )
  }

  public isValidValue(value: any): value is TYPE[] {
    return isInstance(value)
      ? value.$data.every(this.itemType.isValidValue)
      : (
        isUnknownType(this.itemType) ||
        (!!value &&
          Array.isArray(value) &&
          value.every(i => this.itemType.isValidValue(i)))
        )
  }
}
