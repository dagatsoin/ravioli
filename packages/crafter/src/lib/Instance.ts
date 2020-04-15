import { IInstance, OperationListener } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath, isRoot, getRoot } from '../helpers'
import { Migration, Operation } from './JSONPatch'

export abstract class Instance<T, Input = T> implements IInstance<T, Input> {
  
  abstract get $value(): T
  abstract get $id(): string
  
  public $isInstance: true = true
  public $isObservable: true = true
  public $$container: IContainer
  public $parentKey: string | number | undefined
  public $parent: IInstance<any, any> | undefined
  public get $path(){
    // TODO cache this
    return this.$parent ? makePath(this.$parent.$path, this.$parentKey?.toString() ?? '') : '/'
  }
  public get $patch(): Migration {
    return isRoot(this) ? this.$$patch : getRoot(this).$patch
  }

  public set $patch(patch: Migration) {
    if (isRoot(this)) {
      this.$$patch = patch
    } else {
      getRoot(this).$patch = patch
    }
  }
  protected $$id!: string
  
  private $$patch: Migration = { forward: [], backward: [] }
  private $operationListeners: OperationListener[] = []

  public abstract $snapshot: Input
  public abstract $data: any
  public abstract $type: IType<T, Input>

  constructor(context?: IContainer) {
    this.$$container = context || getGlobal().$$crafterContext
  }

  public $transactionDidEnd(): void {
    throw new Error('Method not callable on Leaf.')
  }

  public $addOperationListener(operationListener: OperationListener): void {
    if (isRoot(this)) {
      this.$operationListeners.push(operationListener)
    } else if (this.$parent) {
      this.$parent.$addOperationListener(operationListener)
    }
  }

  public $removeOperationListener(operationListener: OperationListener): void {
    this.$operationListeners.splice(
      this.$operationListeners.indexOf(operationListener),
      1
    )
  }

  public $addPatch<O extends Operation>(migration: Migration<O>): void {
    const { forward, backward } = migration
    if (this.$$container.isTransaction) {
      if (isRoot(this)) {
        this.$$patch.forward.push(...forward)
        this.$$patch.backward.push(...backward)
        this.$operationListeners.forEach(listener => forward.forEach(listener))
      } else if (this.$parent) {
        this.$parent.$addPatch(migration)
      }
    }
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

  public $applySnapshot(snapshot: Input): void {
    if (this.$type.isValidSnapshot(snapshot)) {
      this.$setValue(snapshot)
    }
  }
  public abstract $setValue(value: Input): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}