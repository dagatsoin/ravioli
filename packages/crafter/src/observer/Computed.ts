import { IObservable } from '../IObservable'
import { observable, isObservable } from '../lib/observable'
import { ObserverType, Observer } from './Observer'
import { LeafInstance } from '../lib/LeafInstance'
import { isPrimitive } from '../Primitive'
import {  makePath, toInstance } from '../helpers'
import { IContainer } from '../IContainer'
import { isInstance } from '../lib'

export interface IComputed<T> {
  get(): T
}

/**
 * A Computed is a memoized pure function which outputs either:
 * - an Observable object
 * - a boxed observable value (primitive, binary, ...)
 * A computed expression is evaluated lazily. The function is evaluated will only when Computed.get() is called.
 * During the evaluation, Crafter will register all observable access to maintain a list of dependencies.
 * If one of those dependency changes during a transaction, the computed value will be mark as stale.
 * During the next call to Computed.get(), if the value is stale, the expression will run again, if no stale, it
 * will send back the cached value.
 */

const type = ObserverType.Computed

export class Computed<T> extends Observer implements IComputed<T> {
  public get isStale(): boolean {
    return this._isStale
  }
  public type = type
  public dependencyPaths: string[] = []
  public readonly fun: (boundThis?: IObservable) => T
  private value!: T
  private isAlive: boolean = false
  private isIinitialized = false
  private valueContext: IContainer
  private valueId?: string
  private readonly isBoxed: boolean
  private readonly isStrict: boolean

  constructor(fun: (boundThis?: IObservable) => T, options?: ComputedOptions) {
    super({
      type,
      id: options?.computedId,
      context: options?.contexts?.source
    })
    this.fun = fun
    this.isBoxed = !!options?.isBoxed
    this.valueContext = options?.contexts?.output || this.context
    this.valueId = options?.valueId
    this.isStrict = options && options.useOptional !== undefined
      ? options.useOptional
      : true
  }

  public get(target?: IObservable): T {    

    // Bypass if no reaction is running. That means that the user force the update.
    if (this.valueContext.isRunningReaction) {
      this.valueContext.registerComputedSource(this)
    }
    if (this._isStale) {
      this.runAndUpdateDeps(target)
    }
    // The value is:
    // - a primitive,
    // - a LeafInstance
    // - a non observable object
    // - an observable node but the user wants a boxed value
    // The observers will track the Computed ID.
    if (!isObservable(this.value) || this.isBoxed) {
      this.valueContext.addObservedInstance(this as any, makePath(this.id))
    }
    return this.value
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
    // The observer runs for the first time or is re employed by an other observer
    if (!this.isAlive) {
      this.isAlive = true
    }
    // Listen to all the observable path this computation will access to.
    // This will set a list of dependencies.
    // Each time a dependency change, we will know that this observable will be stale.
    // Computed can ba a bridge between contexts.
    // It can have a context for the output value and a context for the input value.
    // In such case we need to listen to both contexts. 

    if (this.valueContext !== this.context) {
      this.valueContext.startSpyDerivation(this.id)
    }
    this.context.startSpyDerivation(this.id)

    // When creating the observable value, the factory emits read signals for each property.
    // Those signals are not useful and must be bypassed by compute the value BEFORE (1) setting it
    // in the observable to prevent and PAUSE spies (2) during the creation.
    /* 1 */
    const value = target ? this.fun.call(target, target) : this.fun()
    
    /* 2 */
    this.valueContext.pauseSpies()
    // The observer run for the first. We set the observable result.
    if (!this.isIinitialized) {
      // The computation return a leaf instance.
      if (value instanceof LeafInstance) {
        // A leaf instance is not a reactive source
        this.value = value.$data
      }
      // The computation return a primitive
      else if (isPrimitive(value)) {
        // This must be an observable value
        this.value = value
      }
      // The computation return an object
      else {
        // The user don't want a deep observable object.
        if (this.isBoxed) {
          this.value = value
        } else {
          this.value = observable(value, { context: this.valueContext, isStrict: this.isStrict, id: this.valueId })         
        }
      }

      this.isIinitialized = true
    }
    // The observer has already ran. We update the observable value.
    // Note this $setValue won't emit any patch, because it only happens during the learning phase.
    else {
      if (isInstance(this.value)) {
        this.valueContext.transaction(() => toInstance(this.value).$setValue(value))
      } else {
        this.value = value
      }
    }
    this.valueContext.resumeSpies()

    // The value is read during an autorun, reset staleness
    // If not, that means that the user force the update.
    if (this.context.isRunningReaction || this.valueContext.isRunningReaction) {
      this._isStale = false
    }
    const dependencyPaths: string[] = []
    if (this.valueContext !== this.context) {
      dependencyPaths.push(...this.valueContext.stopSpyDerivation(this.id))
    }
    this.dependencyPaths = dependencyPaths.concat(this.context.stopSpyDerivation(this.id))
  }
}

export type ComputedOptions = {
  isBoxed?: boolean
  computedId?: string
  valueId?: string
  useOptional?: boolean
  contexts?: {output?: IContainer, source?: IContainer}
}

export function computed<T>(fun: (boundThis?: IObservable) => T, options?: ComputedOptions): IComputed<T> {
  return new Computed(fun, options)
}
