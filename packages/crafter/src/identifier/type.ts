import { Type } from '../lib/Type'
import { TypeFlag } from '../lib/TypeFlag'
import { IContainer } from '../IContainer'
import { IdentifierInstance } from './instance'

export class IdentifierType<T extends string = string> extends Type<T, T> {
  public isLeaf: true = true
  public readonly type = TypeFlag.identifier
  constructor() {
    super()
    this.type
  }

  public create(value?: T, options?: {id?: undefined, context?: IContainer}): any {
    return new IdentifierInstance({
      type: this,
      value,
      context: options?.context
    })
  }
  public isValidSnapshot(value: any): value is T {
    return typeof value === 'string'
  }

  public isValidValue(value: any): value is T {
    return typeof value === 'string'
  }
}

export function isIdentifierType(thing: any): boolean {
  return (thing as IdentifierType).type === TypeFlag.identifier
}
