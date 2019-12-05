import { IFactory } from '../lib/IFactory'
import { NodeType } from '../lib/NodeType'
import { UnionInstance } from './instance'
import { toInstance, getContext } from '../helpers'
import { IContainer } from '../IContainer'
import { IType } from '../lib/IType'

export class Union<T> extends NodeType<T, T> {
  public types: IType<T>[] = []
  public isNode: true = true

  constructor(types: IFactory<any>[]) {
    super()
    this.types = types as any
  }

  public create = (value?: T, options? : { id?: string, context?: IContainer }): any => {
    const refinedType = this.types.find(t => t.isValidValue(value))
    if (refinedType) {
      const targetInstance = toInstance(refinedType.create(value, options))
      return new UnionInstance({
        type: this,
        types: this.types,
        targetInstance,
        context: getContext(targetInstance)
      })
    }
  }

  public isValidSnapshot = (value?: any): value is T => this.types.some(t => t.isValidSnapshot(value))

  public isValidValue = (value?: any): value is T => this.types.some(t => t.isValidValue(value))
}
