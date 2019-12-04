export function setNonEnumerable(instance: any, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(instance, key)
  Object.defineProperty(instance, key, {
    ...descriptor,
    enumerable: false,
  })
}
