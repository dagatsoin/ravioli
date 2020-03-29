import { ComponentFactory } from '../lib/ComponentFactory'
import { IType } from '@warfog/crafter'
import { IComponentFactory, ComponentOptions } from './IComponentFactory'

export function component<T extends IType<any, any>>(
  type: T,
  options?: ComponentOptions
): IComponentFactory<
  T['Type'],
  T['Snapshot'],
  { type: never; payload: never },
  never,
  {},
  T['Type'],
  never
> {
  return new ComponentFactory(type, options)
}
