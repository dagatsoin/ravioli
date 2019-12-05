import { INodeType } from './INodeType'
import { Type } from './Type'

export abstract class NodeType<TYPE, INPUT> extends Type<TYPE, INPUT>
  implements INodeType<TYPE, INPUT> {
  public isNode: true = true
}

export function isNodeType<T>(thing: any): thing is INodeType<T, T> {
  return (thing as INodeType<any, any>).isNode
}
