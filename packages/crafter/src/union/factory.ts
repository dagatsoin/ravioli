import { ExtractTypes, IType } from '../lib/IType'
import { Union } from './type'

export function union<Factories extends IType<any>[]>(
  types: Factories
): IType<ExtractTypes<Factories>> {
  return new Union(types) as ExtractTypes<Factories>
}
