import { LeafType } from './lib/LeafType'
import { TypeFlag } from './lib/TypeFlag'
import { ILeafType } from './lib'

export function enumeration<S extends string[]>(
  ...acceptableValues: S
): ILeafType<S[number]> {
  return new LeafType<S[number]>({
    defaultValue: '',
    snapshotChecker: (value: any): value is string =>
      acceptableValues.includes(value),
    typeFlag: TypeFlag.string,
    options: {
      isImmutable: false,
      isCheckingEnabled: true,
    },
  })
}
