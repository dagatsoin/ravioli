import { IType } from '../lib/IType'
import { undefinedType } from '../Primitive'
import { union } from '../union'

export function optional<T extends IType<any>>(
  type: T
): IType<(T extends IType<any> ? T['Type'] : never) | undefined> {
  return union([undefinedType(), type])
}
