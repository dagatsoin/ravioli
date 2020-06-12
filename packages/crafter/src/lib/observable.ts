/* import { IObservable } from '../IObservable'
import { IContainer } from '../IContainer'
import { getTypeFromValue } from './getTypeFromValue'

export function observable<T>(value: T, options?: {id?: string, context?: IContainer, isStrict?: boolean}): T & IObservable {
  const isStrict = options?.isStrict !== undefined
    ? options.isStrict
    : true

  const _type = getTypeFromValue(value as any, isStrict)
  if (!_type) {
    throw new Error("Can't infer Type from value. " + JSON.stringify(value))
  }
  return _type.create(value, options)
}

export function isObservable(thing: any): thing is IObservable {
  return thing.$isObservable === true
}

export function getObservable<T>(thing: T): IObservable {
  if (isObservable(thing)) {
    return thing
  }
  throw new Error('getObservable: passed value is not an IObservable')
}


 */