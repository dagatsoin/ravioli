import { INodeType, IType } from '../lib'
import { MapType } from './type'

export function map<F extends IType<any>>(
  itemType: F
): INodeType<
  Map<any, ReturnType<F['create']>>,
  | Map<any, Parameters<F['create']>[0]>
  | [any, Parameters<F['create']>[0]][]
> {
  return new MapType(itemType)
}
