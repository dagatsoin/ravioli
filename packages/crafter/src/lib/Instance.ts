import { IInstance } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal } from '../utils/utils'
import { makePath } from '../helpers'
import { Command, Operation, Migration } from './JSONPatch'

export abstract class Instance<T, Input = T> implements IInstance<T, Input> {
  
  abstract get $value(): T
  abstract get $id(): string
  
  public get $state() {
    return {
      migration: this.$migration
    }
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
  protected $hasStaleSnapshot = true
  private $migration: Migration = { forward: [], backward: []}

  public abstract $snapshot: Input
  public abstract $type: IType<T, Input>
  protected abstract $data: any
  
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
      //this.$setValue(snapshot)
      this.$present([{op: Operation.replace, value: snapshot, path: this.$path}], false)
    }
  }

  protected $invalidateSnapshot(): void {
    this.$hasStaleSnapshot = true
  }

 // public abstract $setValue(value: Input): boolean
  public abstract $present(proposal: Command[], shouldAddMigration: boolean): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}