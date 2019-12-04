import { Props } from '../lib/INodeType'
import { IType } from '../lib/IType'
import { NodeType } from '../lib/NodeType'
import { ObjectInstance } from './instance'

export class ObjectType<T, S> extends NodeType<T> {
  public properties: Props<T>
  public isNode: true = true

  constructor(props: Props<T>) {
    super()
    this.properties = props
  }

  public create = (value?: any, id?: string): any => {
    const v: any = {}
    for (const key in this.properties) {
      const prop = this.properties[key]
      const propValue = value !== undefined ? value[key] : undefined
      v[key] = prop.create(propValue as any)
    }
    return new ObjectInstance<T>(this, { properties: v }, id)
  }

  public isValidValue = (value?: any): value is T => {
    return (
      typeof value === 'object' &&
      Object.keys(this.properties).every(key =>
        (this.properties[key] as IType<T>).isValidValue(value[key])
      )
    )
  }
}