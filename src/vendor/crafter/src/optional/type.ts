import { Snapshot } from '../lib'
import { IType } from '../lib/IType'
import { NodeType } from '../lib/NodeType'

export class Optional<T, S extends Snapshot<T>> extends NodeType<T> {
  public type: IType<T>
  public isNode: true = true

  constructor(type: IType<T>) {
    super()
    this.type = type
  }

  public create = (value?: S): any => {
    if (value && this.type) {
      return this.type.create(value)
    } else {
      return undefined
    }
  }

  public isValidValue = (value?: any): value is T => {
    return value === undefined || this.type.isValidValue(value)
  }
}
