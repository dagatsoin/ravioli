import { setNonEnumerable } from '../../setNonEnumerable'
import { IInstance } from '../IInstance'
import { INodeInstance } from '../INodeInstance'
import { INodeType } from '../INodeType'
import { isNode, NodeInstance } from '../NodeInstance'

export interface IContainer<T> {
  $targetInstance: IInstance<T>
  $isContainer: true
}

export class ContainerInstance<T> extends NodeInstance<T, any>
  implements IContainer<T> {
  public $data: any
  public $type: INodeType<T>
  public $targetInstance: IInstance<T>
  public $isContainer: true = true

  constructor(type: INodeType<T>, targetInstance: IInstance<T>) {
    super(() => this.$targetInstance.$snapshot)
    this.$type = type
    this.$targetInstance = targetInstance
    Object.keys(this).forEach(key => setNonEnumerable(this, key))
    build(this)
  }

  public $attach(parent: INodeInstance<any>, key: string): void {
    this.$parent = parent
    this.$parentKey = key
    if (isNode(this.$targetInstance)) {
      this.$targetInstance.$parent = this.$parent
      this.$targetInstance.$parentKey = this.$parentKey
    }
  }

  get $value(): T {
    return this.$targetInstance.$value
  }

  public $setValue(value: T): void {
    this.$targetInstance.$setValue(value)
  }
}

export function build(container: ContainerInstance<any>) {
  // If it is a node, bind each union instance props to the current refined type instance props
  if (isNode(container.$targetInstance)) {
    // Bind native fields and methods and set them not enumerable
    container.$targetInstance.$nativeTypeKeys.forEach(key => {
      if (container.$targetInstance[key]) {
        container[key] = container.$targetInstance[key]
        setNonEnumerable(container, key)
      }
    })
    // Bind get/set
    Object.keys(container.$targetInstance).forEach(key => {
      Object.defineProperty(container, key, {
        get() {
          return container.$targetInstance[key]
        },
        set(value: any) {
          container.$targetInstance[key] = value
        },
        enumerable: true,
        configurable: true,
      })
    })
  }
}
