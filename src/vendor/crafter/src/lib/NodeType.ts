import { INodeType } from './INodeType'
import { Type } from './Type'

export abstract class NodeType<T> extends Type<T> implements INodeType<T> {
  public isNode: true = true
}

export function isNodeType<T>(thing: any): thing is INodeType<T> {
  return (thing as INodeType<any>).isNode
}
