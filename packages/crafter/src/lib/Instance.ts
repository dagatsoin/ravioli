import { IInstance } from './IInstance'
import { IType } from './IType'
import { IContainer } from '../IContainer'
import { getGlobal, mergeMigrations } from '../utils/utils'
import { makePath, isRoot, getRoot } from '../helpers'
import { Migration, Command } from './JSONPatch'
import { MigrationListener } from './INodeInstance'

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
  public get $migration(): Migration {
    return isRoot(this) ? this.$$migration : getRoot(this).$migration
  }

  public set $migration(migration: Migration) {
    if (isRoot(this)) {
      this.$$migration = migration
    } else {
      getRoot(this).$migration = migration
    }
  }
  protected $$id!: string
  protected $hasStaleSnapshot = true

  private $$migration: Migration = { forward: [], backward: [] }
  private $migrationListeners: MigrationListener[] = []

  public abstract $snapshot: Input
  public abstract $data: any
  public abstract $type: IType<T, Input>

  constructor(context?: IContainer) {
    this.$$container = context || getGlobal().$$crafterContext
  } 

  public $invalidateSnapshot(): void {
    this.$hasStaleSnapshot = true
  }

  public $addTransactionMigrationListener(migrationListener: MigrationListener): void {
    if (isRoot(this)) {
      this.$migrationListeners.push(migrationListener)
    } else if (this.$parent) {
      this.$parent.$addTransactionMigrationListener(migrationListener)
    }
  }

  public $removeTransactionMigrationListener(migrationListener: MigrationListener): void {
    this.$migrationListeners.splice(
      this.$migrationListeners.indexOf(migrationListener),
      1
    )
  }

  public $addMigration<O extends Command>(migration: Migration<O>): void {
    if (this.$$container.isTransaction) {
      if (isRoot(this)) {
        mergeMigrations(migration, this.$$migration)
      } else if (this.$parent) {
        this.$parent.$addMigration(migration)
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
  public abstract $setValue(value: Input): boolean
  public abstract $transactionDidEnd(): void
  public abstract $present(proposal: Command[], shouldAddMigration: boolean): void
}

export function isInstance<T = any>(thing: any): thing is IInstance<T> {
  return thing && (thing as IInstance<T>).$isInstance
}