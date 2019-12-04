export function addHiddenMethod(instance: any, key: string, method: Function) {
  Object.defineProperty(instance, key, {
    configurable: false,
    writable: false,
    enumerable: false,
    value: method,
  })
}

declare const process: any

export const check =
  process.env.NODE_ENV !== 'production'
    ? (predicate: () => boolean, errMessage: string) => {
        if (!predicate()) {
          throw new Error(errMessage)
        }
      }
    : () => {}
