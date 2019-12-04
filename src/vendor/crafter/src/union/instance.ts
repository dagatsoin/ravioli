import { getInstance } from '../helpers'
import { build, ContainerInstance } from '../lib/container/instance'
import { INodeType } from '../lib/INodeType'
import { IType } from '../lib/IType'
import { isNode } from '../lib/NodeInstance'
import { Snapshot } from '../lib/Snapshot'
import { setNonEnumerable } from '../setNonEnumerable'

export class UnionInstance<T, S extends Snapshot<T>> extends ContainerInstance<T> {
  public $types: Array<IType<T>>

  constructor({
    type,
    types,
    refinedType,
    value,
  }: {
    type: INodeType<T>
    types: Array<IType<T>>
    refinedType: IType<T, S>
    value: S
  }) {
    super(type, getInstance(refinedType.create(value)))
    this.$types = types
    // Hide extra fields
    setNonEnumerable(this, '$types')
  }

  public $setValue(value: T): void {
    // The value and this instance have the same type
    if (this.$targetInstance.$type.isValidValue(value)) {
      this.$targetInstance.$setValue(value)
      // The value type is of another type of this union.
    } else {
      // TODO extract to INodeInstance
      if (isNode(this.$targetInstance)) {
        this.$targetInstance.$parent = undefined
        this.$targetInstance.$parentKey = ''
      }
      const type = this.$types.find(t => t.isValidValue(value))

      if (type) {
        this.$targetInstance = getInstance(type.create(value))
        clean(this)
        build(this)
      }
    }
  }
}

function clean(unionInstance: UnionInstance<any, any>) {
  // Delete previous binding
  Object.keys(unionInstance).forEach(k => delete unionInstance[k])
}
