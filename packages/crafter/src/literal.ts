import { LeafType, IType } from './lib'
import { TypeFlag } from './lib/TypeFlag'

// Helper to transform a string to a literal.
export type ToLiteral<S extends string, R = { [key in S]: never }> = keyof R

export function literal<S extends string>(
  defaultValue: S
): IType<ToLiteral<S>> {
  return new LeafType<ToLiteral<S>>({
    defaultValue,
    snapshotChecker: (value: any): value is ToLiteral<S> =>
      typeof value === 'string' && defaultValue === value,
    typeFlag: TypeFlag.string,
    options: {
      isImmutable: true,
      isCheckingEnabled: true,
    },
  })
}
