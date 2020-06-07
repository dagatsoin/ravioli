/* import { MapType } from './type'
import { IType } from '../lib/IType'
import { INodeType } from '../lib/INodeType'

export function map<F extends IType<any>>(
  itemType: F
): INodeType<
  Map<string, ReturnType<F['create']>>,
  | Map<string, Parameters<F['create']>[0]>
  | [string, Parameters<F['create']>[0]][]
> {
  return new MapType(itemType)
}
 */