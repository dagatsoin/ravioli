import { IContainer } from '../IContainer'
import { Migration } from '../lib/JSONPatch'

type Global = {
  // eslint-disable-next-line camelcase
  $$crafterContext: IContainer
}

export function getGlobal(): Global {
  if (window) {
      return window as any
  }
  if (global) {
      return global as any
  }
  if (self) {
      return self as any
  }
  return {} as any
}

export function setNonEnumerable(instance: any, key: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(instance, key)
  Object.defineProperty(instance, key, {
    ...descriptor,
    enumerable: false,
  })
}

export function addHiddenProp(object: any, propName: PropertyKey, value: any): void {
  Object.defineProperty(object, propName, {
      enumerable: false,
      writable: true,
      configurable: true,
      value
  })
}

export function mergeMigrations(source: Migration<any, any>, target: Migration<any, any>) {
  target.forward.push(...source.forward)
  target.backward.push(...source.backward)
}