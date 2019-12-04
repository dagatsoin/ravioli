import { IType } from '../vendor/crafter'
import { Component } from '../lib/Component'
import { IComponent } from './IComponent'

export function component<T>(type: IType<T>): IComponent<{}, {}, {}, {}, T> {
  return new Component(type)
}
