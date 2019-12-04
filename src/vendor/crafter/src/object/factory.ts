import { INodeType, Props } from '../lib/INodeType'
import { ObjectType } from './type'

export function object<T>(properties: Props<T>): INodeType<T> {
  return new ObjectType(properties)
}
