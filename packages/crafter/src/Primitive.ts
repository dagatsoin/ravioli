import { IType } from './lib/IType'
import { LeafType } from './lib/LeafType'
import { TypeFlag } from './lib/TypeFlag'
import { LeafInstance } from './lib'

/**
 * Return true if value is a primitive type
 */
export function isPrimitive(value: any): boolean {
  if (value === null || value === undefined) return true
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  )
}

export function string(defaultValue: string = ''): IType<string> {
  return new LeafType<string>({
    defaultValue,
    typeFlag: TypeFlag.string,
    snapshotChecker: (value: any): value is string => typeof value === 'string',
  })
}

export function number(defaultValue: number = NaN): IType<number> {
  return new LeafType<number>({
    defaultValue,
    typeFlag: TypeFlag.number,
    snapshotChecker: (value: any): value is number => typeof value === 'number',
  })
}

export function boolean(defaultValue: boolean = false): IType<boolean> {
  return new LeafType<boolean>({
    defaultValue,
    typeFlag: TypeFlag.boolean,
    snapshotChecker: (value: any): value is boolean => typeof value === 'boolean',
  })
}

export function undefinedType(): IType<undefined> {
  return new LeafType<undefined>({
    defaultValue: undefined,
    typeFlag: TypeFlag.undefined,
    snapshotChecker: (value?: any): value is undefined => value === undefined,
  })
}

export function unknown(): IType<unknown> {
  return new LeafType<unknown>({
    defaultValue: undefined,
    typeFlag: TypeFlag.unknown,
    snapshotChecker: (_value: any): _value is unknown => true,
  })
}

export function isUnknownType(type: IType<any>) {
  return type instanceof LeafType && type.typeFlag === TypeFlag.unknown
}

export function timeStamp(_timeStamp?: number): IType<number> {
  return new LeafType<number>({
    defaultValue: _timeStamp === undefined ? new Date().getTime() : _timeStamp,
    typeFlag: TypeFlag.timestamp,
    snapshotChecker: (value: any): value is number => typeof value === 'number',
  })
}
