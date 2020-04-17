import { INodeType } from './INodeType'
import { LeafType } from './LeafType'
import { TypeFlag } from './TypeFlag'
import { ILeafType } from './ILeafType'

export type ReferenceType<T extends INodeType<any, any>> = INodeType<ReturnType<T['create']>, string>

export function reference<T extends INodeType<any, any>>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type: T
): ReferenceType<T> {
  return new LeafType<string>({
    defaultValue: '',
    typeFlag: TypeFlag.reference,
    snapshotChecker: (value: any): value is string =>
      typeof value === 'string' && !!value.length,
    options: {
      isImmutable: true,
      isCheckingEnabled: true,
    },
  }) as any
}

export function isReferenceType<T>(thing: any): thing is T {
  return (thing as ILeafType<any>).typeFlag === TypeFlag.reference
}

export type ReferenceValue = string