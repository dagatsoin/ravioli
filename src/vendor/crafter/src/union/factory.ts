import { ExtractTypes, IType } from '../lib/IType'
import { Union } from './type'

export function union<Types extends Array<IType<any>>>(
  types: Types
): IType<ExtractTypes<Types>> {
  return new Union(types) as ExtractTypes<Types>
}
