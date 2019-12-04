import { ILeafType, LeafValueType, Primitive } from './lib/ILeafType'
import { LeafType } from './lib/LeafType'

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

export function isLeafValueType<T>(thing: any): thing is LeafValueType & T {
  return isPrimitive(thing)
}

export function string(defaultValue: string = ''): ILeafType<string> {
  return new LeafType<string>(
    defaultValue,
    Primitive.string,
    (value: any): value is string => typeof value === 'string'
  )
}

export function number(defaultValue: number = NaN): ILeafType<number> {
  return new LeafType<number>(
    defaultValue,
    Primitive.number,
    (value: any): value is number => typeof value === 'number'
  )
}

export function boolean(defaultValue: boolean = false): ILeafType<boolean> {
  return new LeafType<boolean>(
    defaultValue,
    Primitive.boolean,
    (value: any): value is boolean => typeof value === 'boolean'
  )
}

export function undefinedType(): ILeafType<undefined> {
  return new LeafType<undefined>(
    undefined,
    Primitive.undefined,
    (value?: any): value is undefined => value === undefined
  )
}

export function unknown(): ILeafType<unknown> {
  return new LeafType<unknown>(
    undefined,
    Primitive.unknown,
    (_value: any): _value is unknown => true
  )
}

export function timeStamp(_timeStamp?: number): ILeafType<number> {
  return new LeafType<number>(
    _timeStamp === undefined ? new Date().getTime() : _timeStamp,
    Primitive.timestamp,
    (value: any): value is number => typeof value === 'number'
  )
}
