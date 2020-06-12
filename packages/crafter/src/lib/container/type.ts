/* import { toInstance } from '../../helpers'
import { IType } from '../IType'
import { NodeType } from '../NodeType'
import { ContainerInstance } from './instance'
import { IContainer } from '../../IContainer'

export class ContainerType<TYPE> extends NodeType<TYPE, TYPE> {
  public targetType: IType<TYPE>

  constructor(targetType: IType<any>) {
    super()
    this.targetType = targetType
  }

  public create = (value?: any, options?: { id?: string, context?: IContainer }): any => new ContainerInstance(
      this,
      toInstance(this.targetType.create(value, options)),
      options
    )

  public isValidValue = (value?: any): value is TYPE => this.targetType.isValidValue(value)

  public isValidSnapshot = (value?: any): value is TYPE => this.targetType.isValidSnapshot(value)
}
 */