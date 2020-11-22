import { IInstance, State } from './IInstance'
import { IType } from './IType'
import { ControlState, IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath, getRoot } from '../helpers'
import { Command, Operation } from './JSONPatch'
import { DataNode } from './INodeInstance'

export abstract class Instance<T, SNAPSHOT = T> implements IInstance<T, SNAPSHOT> {
  
  abstract get $value(): T
  abstract get $id(): string
  
  public $state: State = {
    didChange: false,
    migration: { forward: [], backward: []}
  }
  
  public $isInstance: true = true
  public $isObservable: true = true
  public $$container: IContainer
  public $parentKey: string | number | undefined
  public $parent: IInstance<any, any> | undefined
  public $hasStaleSnapshot = true
  public $hasStaleValue = true

  protected $$id!: string

  private $snapshotComputation: (data: T, context: IContainer) => SNAPSHOT
  private $prevSnapshot: SNAPSHOT = (undefined as unknown) as SNAPSHOT

  public abstract $type: IType<T, SNAPSHOT>
  public abstract $data: DataNode | T
  public get $path(){
    // TODO cache this
    return this.$parent ? makePath(this.$parent.$path, this.$parentKey?.toString() ?? '') : '/'
  }

  
  constructor(
    snapshotComputation: (data: any, context: IContainer) => SNAPSHOT,
    context?: IContainer
  ) {
    this.$$container = context || getGlobal().$$crafterContext
    this.$snapshotComputation = snapshotComputation
  }

  public $kill(): void {
    this.$$container.removeUID(this.$$id)
    this.$detach()
    this.$$container.unregisterAsReferencable(this.$$id)
  }

  public $attach(parent: IInstance<any>, key: number | string) {
    this.$parent = parent
    this.$parentKey = key
  }

  public $detach(){
    this.$parent = undefined
    this.$parentKey = ''
  }

  public $applySnapshot(snapshot: SNAPSHOT): void {
    if (this.$type.isValidSnapshot(snapshot)) {
      this.$present([{op: Operation.replace, value: snapshot, path: this.$path}])
    }
  }

  public $invalidate(): void {
    this.$hasStaleSnapshot = true
    this.$hasStaleValue = true
    // Stop the propagation if parent is already stale
    if (this.$parent && (!this.$parent.$hasStaleSnapshot || !this.$parent.$hasStaleValue)) {
      this.$parent.$invalidate()
    }
  }
  
  public get $snapshot(): SNAPSHOT {
    if (this.$hasStaleSnapshot && this.$$container.controlState !== ControlState.MUTATION) {
      this.$computeSnapshot()
    }
    return this.$prevSnapshot
  }
  public $computeSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data as any, this.$$container)
    this.$hasStaleSnapshot = false
  }

  public $notifyRead(): void {
    this.$$container.notifyRead(makePath(getRoot(this).$id, this.$path))
  }

  public $createNewSnapshot(): SNAPSHOT {
    return this.$snapshotComputation(this.$data as any, this.$$container)
  }

  public abstract $present(proposal: Command[]): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}