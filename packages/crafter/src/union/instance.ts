import { toInstance } from '../helpers'
import { build, ContainerInstance } from '../lib/container/instance'
import { IFactory } from '../lib/IFactory'
import { INodeType } from '../lib/INodeType'
import { IType } from '../lib/IType'
import { isNode } from "../lib/isNode"
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../utils/utils'

import { IInstance } from '../lib'
import { IContainer } from '../IContainer'

export class UnionInstance<T, S extends Snapshot<T>> extends ContainerInstance<
  T
> {
  public $types: IType<T>[]

  constructor({
    type,
    types,
    targetInstance,
    context
  }: {
    type: INodeType<T, T>
    types: IFactory<T>[]
    targetInstance: IInstance<T>
    context?: IContainer
  }) {
    super(type, targetInstance, { context })
    this.$types = types as IType<T>[]
    // Hide extra fields
    setNonEnumerable(this, '$types')
  }

  public $setValue(value: T): void {
    // The value and this instance have the same type
    if (this.$targetInstance.$type.isValidValue(value)) {
      this.$targetInstance.$setValue(value)
      // The value type is of another type of this union.
    } else {
      const type = this.$types.find(t => t.isValidValue(value))

      if (type) {
        clean(this)
        this.$targetInstance = toInstance(type.create(value, { id: this.$id, context: this.$$container }))
        build(this)
      }
    }
  }
}

function clean(unionInstance: UnionInstance<any, any>): void {
  unionInstance.$targetInstance.$kill()
  // Delete previous binding
  if (isNode(unionInstance.$targetInstance)) {
    Object.keys(unionInstance).forEach(k => delete unionInstance[k])
  }
}
