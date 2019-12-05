import { IType } from '../lib/IType'
import { NodeType } from '../lib/NodeType'
import { ObjectFactoryInput, ObjectFactoryOutput } from './factory'
import { ObjectInstance } from './instance'
import { Props } from './Props'
import { IContainer } from '../IContainer'
import { Computed } from '../observer/Computed'
import { isInstance } from '../lib/Instance'

export class ObjectType<
  TYPE extends {},
  PROPS extends Props<any>,
  OUTPUT extends ObjectFactoryOutput<PROPS>,
  INPUT extends ObjectFactoryInput<PROPS>
> extends NodeType<OUTPUT, INPUT> {
  public properties: PROPS
  public isNode: true = true

  constructor(props: PROPS) {
    super()
    this.properties = props
  }

  public create = (value?: INPUT, options?: { id?: string, context?: IContainer }): OUTPUT =>
    new ObjectInstance<TYPE, PROPS, OUTPUT, INPUT>({
      type: this,
      value,
      options
    }) as any

  public isValidSnapshot = (value?: any): value is INPUT => (
      typeof value === 'object' &&
      Object.keys(this.properties).every(key => {
        if (this.properties[key]  instanceof Computed) {
          return true
        }
        return (this.properties[key] as IType<OUTPUT, INPUT>).isValidSnapshot(
          value[key]
        )
      })
    )

  public isValidValue = (value: any): value is INPUT => {
    return value && (
      isInstance(value)
        ? value.$type === this && Object.keys(this.properties)
          .every(key => {
            if (this.properties[key]  instanceof Computed) {
              return true
            }
            return (this.properties[key] as IType<OUTPUT, INPUT>).isValidValue(
              value[key]
            )
          })
        : Object.keys(this.properties)
          .every(key => {
            if (this.properties[key]  instanceof Computed) {
              return true
            }
            return (this.properties[key] as IType<OUTPUT, INPUT>).isValidValue(
              value[key]
            )
          })
    )
  }
}