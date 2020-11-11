import { IObservable } from '../IObservable'
import { observable, isObservable } from '../lib/observable'
import { Observer } from './Observer'
import { ObserverType } from './IObserver'
import { makePath, toInstance, toLeaf, setValue } from '../helpers'
import { IContainer } from '../IContainer'
import { isInstance } from '../lib/Instance'
import { isNode } from '../lib/isNode'
import { Migration } from '../lib/JSONPatch'
import { IDerivation } from './IDerivation'

/**
 * A Computed is a memoized pure function which outputs either:
 * - an Observable object
 * - a boxed observable value (primitive, binary, ...)
 * A computed expression is evaluated lazily. The function is evaluated will only when Computed.get() is called.
 * During the evaluation, Crafter will register all observable access to maintain a list of dependencies.
 * If one of those dependency changes during a step, the computed value will be mark as stale.
 * During the next call to Computed.get(), if the value is stale, the expression will run again, if no stale, it
 * will send back the cached value.
 */

const type = ObserverType.Derivation

export class Derivation<T> extends Observer implements IDerivation<T> {
  public get isStale(): boolean {
    return this._isStale
  }
  public $isObservable: true = true
  public type = type
  public readonly fun: (boundThis?: IObservable) => T
  private value!: T
  private isAlive: boolean = false
  private isIinitialized = false
  private valueContext: IContainer
  private valueId?: string
  private readonly isInstance: boolean
  private readonly isStrict: boolean
  private migration: Migration = {forward: [], backward: []}

  constructor(fun: (boundThis?: IObservable) => T, options?: ComputedOptions) {
    super({
      type,
      id: options?.computedId,
      context: options?.contexts?.source
    })
    this.fun = fun
    this.isInstance = options?.isInstance ?? true
    this.valueContext = options?.contexts?.output ?? this.context
    this.valueId = options?.valueId
    this.isStrict = options?.useOptional ?? true
  }

  public get $id(): string {
    return this.isInstance
      ? toInstance(this.value).$id
      : this.id
  }

  public get $migration(): Migration {
    return isNode(this.value)
      ? this.value.$state.migration
      : this.migration
  }

  public get(target?: IObservable): T {
    // FIXME    autorun observes computed instead of the leaf    

    if (this._isStale) {
      this.runAndUpdateDeps(target)
    }
   // FIX ME est ce qu'on a toujours besoin de notifier le container de la lecture de la derivation si c'est une instance qu'il retourne ?
    this.valueContext.notifyRead(makePath(this.$id))

    if (!this.isInstance) {
      // The value is a boxed value (could be a primitive or any object)
   //   this.valueContext.notifyRead(makePath(this.id))
      return this.value
    } else if (isNode(this.value)){
      // The value is an observable node
      return this.value
    } else {
      // The value is an observable leaf
      return toLeaf<T>(this.value).$value
    }
  }

  public get observedValueId(): string{
    return isObservable(this.value)
      ? this.value.$id
      : this.id
  }

  public dispose = (): void => {
    this._isStale = true
    this.isAlive = false
    if (isInstance(this.value)) {
      this.value.$kill()
    }
  }

  public runAndUpdateDeps(target?: IObservable): void {
    if (!this._isStale) {
      return
    }
    // The observer runs for the first time or is re employed by an other observer
    if (!this.isAlive) {
      this.context.registerObserver(this)
      this.isAlive = true
    }
    // Listen to all the observable path this computation will access to.
    // This will set a list of dependencies.
    // Each time a dependency change, we will know that this observable will be stale.
    // Computed can ba a bridge between contexts.
    // It can have a context for the output value and a context for the input value.
    // In such case we need to listen to both contexts. 

    if (this.valueContext !== this.context) {
      this.valueContext.startSpyObserver(this)
    }
    this.context.startSpyObserver(this)

    // When creating the observable value, the factory emits read signals for each property.
    // Those signals are not useful and must be bypassed by compute the value BEFORE (1) setting it
    // in the observable to prevent and PAUSE spies (2) during the creation.
    /* 1 */
    const value = target ? this.fun.call(target, target) : this.fun()
      
      /* 2 */
    this.valueContext.pauseSpies()
    // The observer run for the first time. We set the observable result.
    if (!this.isIinitialized) {
      // This derivation returns an observable
      if (this.isInstance) {
        const id = this.valueContext.getUID(this.id + '/')
        this.value = observable(value, { context: this.valueContext, isStrict: this.isStrict,  id })
      } else {
        this.value = value
      }

      this.isIinitialized = true
    }
    // The observer has already ran. We update the observable value.
    // Note this $setValue won't emit any migration, because it only happens during the learning phase.
    else {
      // This derivation returns an observable
      if (this.isInstance) {
        const instance = toInstance<T>(this.value)
        this.valueContext.step(() => setValue(instance, value, false))
        if (!isNode(instance)) {
          this.migration.forward = [{op: "replace", path: makePath(instance.$id), value: toLeaf(instance).$value}]
        }
      } else {
        this.migration.forward = [{op: "replace", path: makePath(this.id), value: this.value}]
        this.value = value
      }
    }
    this.valueContext.resumeSpies()

    // The value is read during an autorun, reset staleness
//    if (this.context.isRunningReaction || this.valueContext.isRunningReaction) {
      this._isStale = false
  //  }

    if (this.valueContext !== this.context) {
      this.valueContext.stopSpyObserver(this.id)
    } else {
      this.context.stopSpyObserver(this.id)    
    }
  }
}

export type ComputedOptions = {
  isInstance?: boolean
  computedId?: string
  valueId?: string
  useOptional?: boolean
  contexts?: {output?: IContainer, source?: IContainer}
}


