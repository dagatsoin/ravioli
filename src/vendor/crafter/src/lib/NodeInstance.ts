import * as Manager from '../STManager'
import { ContainerInstance, IContainer } from './container/instance'
import { IInstance } from './IInstance'
import { DataNode, INodeInstance } from './INodeInstance'
import { Instance } from './Instance'
import { Operation } from './JSONPatch'
import { Snapshot } from "./Snapshot"

/**
 * An observable is an object/array/map whose properties are watched.
 * During a spy phase (eg, a reactive computation reading an observable), the observable
 * add the absolute path of the property (eg: /rootObservableId/propertyKey/radeObservable/radeKey)
 * When the spy phase is over. The manager knows all exact paths that are actually used by the app.
 * When a mutation occure, during a transaction phase, the observable:
 * - report all the change as a JSON Patch
 * - tell to the Manager that something is being change, it must get the patch when the transaction will be complete.
 *
 * The observables are organized in a hierarchy. There are some roots observables and some children.
 * Only a root observable stores the patch for the whole tree.
 */

export abstract class NodeInstance<T, D extends DataNode, S extends Snapshot<T> = Snapshot<T>>
  extends Instance<T, D, S>
  implements INodeInstance<T, S> {
  public $isObservable: true = true
  public $id: string
  public $isRefreshingDependencies: boolean = false
  public $isNode: true = true
  public $parentKey: string | number | undefined = undefined
  public $parent: INodeInstance<any> | undefined = undefined

  private $$patch: Operation[] = []
  private $$nativeTypeKeys: string[]
  private $computeSnapshot: (data: DataNode) => S
  constructor(
    computeSnapshot: (data: DataNode) => S,
    methodKeys: string[] = [],
    id?: string
  ) {
    super()
    this.$$nativeTypeKeys = methodKeys
    this.$computeSnapshot = computeSnapshot
    this.$id = id || 'Observable' + Manager.UID()
  }

  get $nativeTypeKeys(): string[] {
    return this.$$nativeTypeKeys
  }
  public abstract $attach(parent: INodeInstance<any>, key: number | string): void

  get $path() {
    // TODO cache this
    return this.$parent ? this.$parent.$path + '/' + this.$parentKey : ''
  }

  get $patch() {
    return isRoot(this) ? this.$$patch : getRoot(this).$patch
  }

  set $patch(patch: Operation[]) {
    if (isRoot(this)) {
      this.$$patch = patch
    } else {
      getRoot(this).$patch = patch
    }
  }

  get $value(): T {
    return (this as unknown) as T
  }

  get $snapshot(): S {
    return this.$computeSnapshot(this.$data)
  }

  public $transactionDidEnd() {
    this.$patch = []
  }

  public $addPatch(op: Operation) {
    if (Manager.isTransaction()) {
      if (isRoot(this)) {
        this.$$patch.push(op)
      } else {
        if (this.$parent) {
          this.$parent.$addPatch(op)
        }
      }
    }
  }
}

export function isRoot(node: INodeInstance<any>): boolean {
  return node.$parent === undefined
}

export function isContainer<T>(
  value: IInstance<T>
): value is ContainerInstance<T> {
  return ((value as unknown) as IContainer<T>).$isContainer === true
}

export function isNode<T>(value: any): value is INodeInstance<T> {
  return (
    (((value as unknown) as INodeInstance<T>).$isNode && !isContainer(value)) ||
    (isContainer(value) && isNode(value.$targetInstance))
  )
}

export function getRoot(node: INodeInstance<any>): INodeInstance<any> {
  return node.$parent ? getRoot(node.$parent) : node
}
