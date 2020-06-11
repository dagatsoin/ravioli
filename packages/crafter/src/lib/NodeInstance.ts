import { IInstance } from './IInstance'
import {
  DataNode,
  INodeInstance
} from './INodeInstance'
import { Instance } from './Instance'
import { Command } from './JSONPatch'
import { IContainer } from '../IContainer'

/**
 * An observable is an object/array/map whose properties are watched.
 * During a spy phase (eg, a reactive computation reading an observable), the observable
 * add the absolute path of the property (eg: /rootObservableId/propertyKey/radeObservable/radeKey)
 * When the spy phase is over. The manager knows all exact paths that are actually used by the app.
 * When a mutation occure, during a transaction phase, the observable:
 * - report all the change as a JSON Patch
 * - tell to the Manager that something is being change, it must get the migration when the transaction will be complete.
 *
 * The observables are organized in a hierarchy. There are some roots observables and some children.
 * Only a root observable stores the migration for the whole tree.
 */

export abstract class NodeInstance<TYPE, SNAPSHOT = TYPE>
  extends Instance<TYPE, SNAPSHOT>
  implements INodeInstance<TYPE, SNAPSHOT> {
  [x: string]: any
  public $isObservable: true = true
  public $isRefreshingDependencies: boolean = false
  public $isNode: true = true

  /**
   * Interface IWithParent is implemented in commont.ts and assigned in constructor
   */
  public $path!: string
  public $parentKey: string | number | undefined = undefined
  public $parent: INodeInstance<any> | undefined = undefined  
  
  private $$nativeTypeKeys: string[]
  private $snapshotComputation: (data: DataNode, context: IContainer) => SNAPSHOT
  private $valueComputation: (data: DataNode, context: IContainer) => TYPE
  private $prevValue: TYPE = (undefined as unknown) as TYPE
  private $prevSnapshot: SNAPSHOT = (undefined as unknown) as SNAPSHOT
  constructor(
    snapshotComputation: (data: any, context: IContainer) => SNAPSHOT,
    valueComputation: (data: any, context: IContainer) => TYPE,
    methodKeys: string[] = [],
    options?: {
      id?: string,
      context?: IContainer
    }
  ) {
    super(options?.context)
    this.$$nativeTypeKeys = methodKeys
    this.$snapshotComputation = snapshotComputation
    this.$valueComputation = valueComputation

    if (options?.id) {
      if (!this.$$container.isUID(options.id)) {
        throw new Error(`UID ${options.id} is already in use`)
      }
      this.$$id = options.id
    } else {
      this.$$id = this.$$container.getUID('NodeInstance#')
    }
    this.$$container.useUID(this.$$id)
    this.$$container.registerAsReferencable(this.$$id, this)
  }

  public get $nativeTypeKeys(): string[] {
    return this.$$nativeTypeKeys
  }

  public get $value(): TYPE {
    if (!this.$$container.isTransaction) {
      // TODO use a computed instead
      this.$computeValue()
    }
    return this.$prevValue
  }

  public get $snapshot(): SNAPSHOT {
    if (this.$hasStaleSnapshot) {
      this.$computeSnapshot()
    }
    return this.$prevSnapshot
  }

  public get $id(): string {
    return this.$$id
  }

  public $computeSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data, this.$$container)
    this.$hasStaleSnapshot = false
  }

  public $createNewSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data, this.$$container)
  }

  private $computeValue(): void {
    this.$prevValue = this.$valueComputation(this.$data, this.$$container)
  }
  
  public abstract $present(proposal: Command[], shouldAddMigration: boolean): void
  public abstract $addInterceptor(index: number | string): void
  public abstract $createChildInstance<I>(item: I, index: any): IInstance<I>
}