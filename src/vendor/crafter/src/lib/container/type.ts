import { getInstance } from '../../helpers'
import { IType } from '../IType'
import { NodeType } from '../NodeType'
import { ContainerInstance } from './instance'

export class ContainerType<T> extends NodeType<T> {
  public targetType: IType<T>

  constructor(targetType: IType<any>) {
    super()
    this.targetType = targetType
  }

  public create = (value?: any): any => {
    return new ContainerInstance(
      this,
      getInstance(this.targetType.create(value))
    )
  }

  public isValidValue = (value?: any): value is T => {
    return this.targetType.isValidValue(value)
  }
}
