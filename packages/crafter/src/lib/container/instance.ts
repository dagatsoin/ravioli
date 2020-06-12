/* import { getChildKey, isOwnLeafPath } from '../../helpers'
import { setNonEnumerable } from '../../utils/utils'
import { IInstance } from '../IInstance'
import { INodeInstance } from '../INodeInstance'
import { INodeType } from '../INodeType'
import { Command, isShapeMutationOperation } from '../JSONPatch'
import { NodeInstance } from '../NodeInstance'
import { isNode } from "../isNode"
import { ArrayInstance } from '../../array/instance'
import { MapInstance } from '../../map'
import { IContainer } from '../../IContainer'
import { IInstanceContainer } from './IInstanceContainer'

export class ContainerInstance<TYPE> extends NodeInstance<TYPE, any>
  implements IInstanceContainer<TYPE> {
  public $data: any
  public $type: INodeType<TYPE, TYPE>
  public $targetInstance!: IInstance<TYPE>
  public $isContainer: true = true

  constructor(type: INodeType<TYPE, TYPE>, targetInstance: IInstance<TYPE>, options?: {id?: string, context?: IContainer}) {
    super(
      () => this.$targetInstance.$snapshot,
      () => this.$targetInstance.$value,
      [],
      options
    )
    this.$type = type
    if (targetInstance) {
      this.$targetInstance = targetInstance
      build(this)
    }
  }
  public $addInterceptor(_index: string | number): void {
    throw new Error('Container $addInterceptor method is not callable.')
  }
  public $createChildInstance<I>(_item: I, _index: any): IInstance<I> {
    throw new Error('Container $createChildInstance method is not callable.')
  }
  public $attach(parent: INodeInstance<any>, key: string): void {
    super.$attach(parent, key)
    this.$targetInstance.$attach(parent, key)
    this.$targetInstance.$addTransactionMigrationListener(m => m.forward.forEach(command => {
      if (this.$targetInstance instanceof MapInstance) {
        // Map does not need to sync its first level keys. All data is stored in entries.
        return
      }
      if (command.op === 'add') {
        // Check if the mutation concerns the node itself (not a children)
        if (isOwnLeafPath(this.$path, command.path)) {
          const childKey = getChildKey(this.$path, command.path)
          if(childKey === undefined) throw new Error('[CRAFTER] add command, command.from is undefined')
          addGetterSetter(this, childKey)
        }
      } else if (command.op === 'remove') {
        if (isOwnLeafPath(this.$path, command.path)) {
          const childKey = getChildKey(this.$path, command.path)
          if (childKey) {
            delete this[childKey]
          }
        }
      } else if (isShapeMutationOperation(command)) {
        // Depending on the type, we reflect the key index changes
        if (this.$targetInstance instanceof ArrayInstance) {
          const thisLength = Object.keys(this).filter(k => !isNaN(Number(k))).length
          const lengthDiff = thisLength - Object.keys(this.$targetInstance).filter(k => !isNaN(Number(k))).length
          if (lengthDiff < 0) {
            for(let i = thisLength; i < thisLength - lengthDiff; i++) {
              addGetterSetter(this, i)
            }
          } else if (lengthDiff > 0) {
            for(let i = this.$targetInstance.length; i < this.$targetInstance.length + lengthDiff; i++) {
              delete this[i]
            }
          }
        } else  if (this.$targetInstance instanceof MapInstance) {
          const isSync = Object.keys(this).length - Object.keys(this.$targetInstance).length
          if (!isSync) {
            Object.keys(this).forEach(k => delete this[k])
            build(this)
          }  
        }
      }
    }))
    
    // Listen to mutation.
    // If a add or remove is detected, reflect the changes in the container
  }

  public $kill(): void {
    super.$kill()
    this.$targetInstance.$kill()
  }

  public $present(proposal: Command[], shouldAddMigration: boolean): void {
    if (isNode(this.$targetInstance)) {
      this.$targetInstance.$present(proposal, shouldAddMigration)
    }
  }

  // Relay the $id of the target instance
  public get $id(): string {
    return this.$targetInstance.$id
  }

  public get $value(): TYPE {
    return this.$targetInstance.$value
  }

  public $setValue(value: TYPE): boolean {
    return this.$targetInstance.$setValue(value)
  }
}

export function build(container: ContainerInstance<any>): void {
  Object.keys(container).forEach(key => setNonEnumerable(container, key))

  // If it is a node, bind each union instance props to the current refined type instance props
  if (isNode(container.$targetInstance)) {
    // Bind native fields and methods and set them non enumerable
    container.$targetInstance.$nativeTypeKeys.forEach(key => {
      if (container.$targetInstance[key]) {
        // All target instance primitive values are bound via a getter/setter
        const hasDescriptor = Object.getOwnPropertyDescriptor(
          container.$targetInstance,
          key
        )
        if (!hasDescriptor) {
          addGetterSetter(container, key)
        } else {
          container[key] = container.$targetInstance[key]
        }
        setNonEnumerable(container, key)
      }
    })
    // Bind get/set
    Object.keys(container.$targetInstance).forEach(key =>
      addGetterSetter(container, key)
    )
  }
}
function addGetterSetter(
  container: ContainerInstance<any>,
  key: string | number
): void {
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
}
 */