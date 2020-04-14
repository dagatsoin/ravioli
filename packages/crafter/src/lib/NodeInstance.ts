import { getRoot, path } from '../helpers'
import { IInstance } from './IInstance'
import {
  DataNode,
  INodeInstance,
  OperationListener,
  PatchListener,
} from './INodeInstance'
import { Instance } from './Instance'
import { Migration, Operation } from './JSONPatch'
import { IContainer } from '../IContainer'

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

export abstract class NodeInstance<TYPE, SNAPSHOT = TYPE>
  extends Instance<TYPE, SNAPSHOT>
  implements INodeInstance<TYPE, SNAPSHOT> {
  [x: string]: any
  public $isObservable: true = true
  public $isRefreshingDependencies: boolean = false
  public $isNode: true = true
  public $parentKey: string | number | undefined = undefined
  public $parent: INodeInstance<any> | undefined = undefined

  private $hasStaleSnapshot = true
  private $$patch: Migration = { forward: [], backward: [] }
  private $$nativeTypeKeys: string[]
  private $snapshotComputation: (data: DataNode) => SNAPSHOT
  private $valueComputation: (data: DataNode) => TYPE
  private $operationListeners: OperationListener[] = []
  private $transactionPatchListeners: PatchListener[] = []
  private $prevValue: TYPE = (undefined as unknown) as TYPE
  private $prevSnapshot: SNAPSHOT = (undefined as unknown) as SNAPSHOT
  constructor(
    snapshotComputation: (data: any) => SNAPSHOT,
    valueComputation: (data: any) => TYPE,
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
  public $attach(parent: INodeInstance<any>, key: number | string): void {
    this.$parent = parent
    this.$parentKey = key
  }

  public get $path(): string {
    // TODO cache this
    return this.$parent ? path(this.$parent.$path, this.$parentKey?.toString() ?? '') : '/'
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

  public $detach(): void {
    this.$parent = undefined
    this.$parentKey = ''
  }

  public $kill(): void {
    super.$kill()
    this.$detach()
    this.$$container.unregisterAsReferencable(this.$$id)
  }

  public $computeSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data)
    this.$hasStaleSnapshot = false
  }

  public $createNewSnapshot(): void {
    this.$prevSnapshot = this.$snapshotComputation(this.$data)
  }

  public $transactionDidEnd(): void {
    if (isRoot(this)) {
      this.$transactionPatchListeners.forEach(l => l(this.$patch))
      this.$patch = { forward: [], backward: [] }
    } else if (this.$parent) {
      this.$parent.$transactionDidEnd()
    }
  }

  public $addTransactionPatchListener(patchListener: PatchListener): void {
    this.$transactionPatchListeners.push(patchListener)
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

  public $invalidateSnapshot(): void {
    this.$hasStaleSnapshot = true
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

  private $computeValue(): void {
    this.$prevValue = this.$valueComputation(this.$data)
  }
  
  public abstract $applyOperation<O extends Operation>(operation: O): void
  public abstract $addInterceptor(index: number | string): void
  public abstract $createChildInstance<I>(item: I, index: any): IInstance<I>
}

export function isRoot(node: INodeInstance<any>): boolean {
  return node.$parent === undefined
}

