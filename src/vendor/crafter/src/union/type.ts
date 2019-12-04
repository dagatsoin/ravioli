import { IType } from '../lib/IType'
import { NodeType } from '../lib/NodeType'
import { UnionInstance } from './instance'

export class Union<T> extends NodeType<T> {
  public types: Array<IType<T>> = []
  public isNode: true = true

  constructor(types: Array<IType<any>>) {
    super()
    this.types = types
  }

  public create = (value?: any): any => {
    const refinedType = this.types.find(t => t.isValidValue(value))
    if (refinedType) {
      return new UnionInstance({
        type: this,
        types: this.types,
        refinedType,
        value,
      })
    }
  }

  public isValidValue = (value?: any): value is T => {
    return this.types.some(t => t.isValidValue(value))
  }
}
