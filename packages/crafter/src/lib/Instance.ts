import { IInstance, State } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath } from '../helpers'
import { Command, Operation } from './JSONPatch'

export abstract class Instance<T, Input = T> implements IInstance<T, Input> {
  
  abstract get $value(): T
  abstract get $id(): string
  
  public $state: State = {
    hasAcceptedWholeProposal: true,
    migration: { forward: [], backward: []}
  }
  public $isInstance: true = true
  public $isObservable: true = true
  public $$container: IContainer
  public $parentKey: string | number | undefined
  public $parent: IInstance<any, any> | undefined
  public get $path(){
    // TODO cache this
    return this.$parent ? makePath(this.$parent.$path, this.$parentKey?.toString() ?? '') : '/'
  }
  protected $$id!: string

  public $hasStaleSnapshot = true
  public abstract $snapshot: Input
  public abstract $type: IType<T, Input>
  public abstract $data: T
  
  constructor(context?: IContainer) {
    this.$$container = context || getGlobal().$$crafterContext
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
      this.$present([{op: Operation.replace, value: snapshot, path: this.$path}], false)
    }
  }

  public $invalidateSnapshot(): void {
    this.$hasStaleSnapshot = true
    if (this.$parent && !this.$parent.$hasStaleSnapshot) {
      this.$parent.$invalidateSnapshot()
    }
  }

  public abstract $present(proposal: Command[], addMigration: boolean): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}