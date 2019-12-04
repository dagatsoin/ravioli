import { array } from '../array'
import { IObservable } from '../IObservable'
import { map } from '../map'
import { object } from '../object'
import { optional } from '../optional'
import { boolean, number, string, timeStamp, unknown } from '../Primitive'
import { IInstance } from './IInstance'
import { isInstance } from './Instance'
import { IType } from './IType'

export function observable<T>(
  value: T,
  options?: { type?: IType<T>; id?: string }
): T & IObservable {
  const _type = (options && options.type) || getTypeFromValue(value as any)
  if (!_type) {
    throw new Error("Can't infer Type from value. " + JSON.stringify(value))
  }
  return _type.create(value, options && options.id)
}

export function isObservable(thing: any): thing is IObservable {
  return thing.$isObservable === true
}

export function getTypeFromValue<
  T extends
    | string
    | number
    | object
    | any[]
    | Map<any, any>
    | IInstance<any>
>(value: T): IType<any> {
  if (isInstance(value)) {
    return value.$type
  }
  if (value instanceof Map) {
    const hasValue = getTypeFromValue(value.size)
    return hasValue
      ? map(getTypeFromValue(value.values().next()))
      : map(unknown())
  }
  if (typeof value === 'undefined') {
    return optional(unknown())
  }
  if (typeof value === 'string') {
    return optional(string(value))
  }
  if (typeof value === 'number') {
    return optional(number(value))
  }
  if (value instanceof Date) {
    return optional(timeStamp(value.getTime()))
  }
  if (typeof value === 'boolean') {
    return optional(boolean(value))
  }
  if (Array.isArray(value)) {
    const hasValue = !!value.length
    return hasValue ? array(getTypeFromValue(value[0])) : array(unknown())
  }
  // Else it is an object
  else {
    // build object
    const keys = Object.keys(value)
    const properties = {}
    keys.forEach(
      key => (properties[key] = optional(getTypeFromValue(value[key])))
    )
    return object(properties)
  }
}