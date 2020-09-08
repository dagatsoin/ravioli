import { IInstance, State } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath, getRoot } from '../helpers'
import { Command, Operation } from './JSONPatch'

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
  public $isStale = true

  protected $$id!: string

  private $snapshotComputation: (data: T, context: IContainer) => SNAPSHOT
  private $prevSnapshot: SNAPSHOT = (undefined as unknown) as SNAPSHOT

  public abstract $type: IType<T, SNAPSHOT>
  public abstract $data: T
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
      this.$present([{op: Operation.replace, value: snapshot, path: this.$path}], false)
    }
  }

  public $invalidateSnapshot(): void {
    this.$isStale = true
    if (this.$parent && !this.$parent.$isStale) {
      this.$parent.$invalidateSnapshot()
    }
  }
  
  public get $snapshot(): SNAPSHOT {
    if (this.$isStale) {
      this.$computeSnapshot()
    }
    return this.$prevSnapshot
  }
  public $computeSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data as any, this.$$container)
    this.$isStale = false
  }

  public $notifyRead(): void {
    this.$$container.notifyRead(this, makePath(getRoot(this).$id, this.$path))
  }

  public $createNewSnapshot(): SNAPSHOT {
    return this.$snapshotComputation(this.$data as any, this.$$container)
  }

  public abstract $present(proposal: Command[], addMigration: boolean): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}