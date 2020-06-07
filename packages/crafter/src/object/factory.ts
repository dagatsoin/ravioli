/* import { INodeType } from '../lib'
import { FactoryInput, FactoryOutput } from '../lib/IFactory'
import { Props } from './Props'
import { ObjectType } from './type'

export function object<
  P extends Props<{}>,
  T extends ObjectFactoryOutput<P> = ObjectFactoryOutput<P>
>(properties: P): INodeType<T, ObjectFactoryInput<P>> {
  return new ObjectType<any, any, any, any>(properties)
}

export type ObjectFactoryInput<P extends Props<any>> = {
  [K in keyof P]: FactoryInput<P[K]>
}

export type ObjectFactoryOutput<P extends Props<any>> = {
  [K in keyof P]: FactoryOutput<P[K]>
}
 */