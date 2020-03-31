import { IObservable } from '../IObservable'
import { observable } from '../lib/observable'
import { ObserverType, Observer } from './Observer'
import { LeafInstance } from '../lib/LeafInstance'
import { isPrimitive } from '../Primitive'
import { toNode } from '../helpers'
import { IContainer } from '../IContainer'
import { isNode } from '../lib/isNode'
import { isInstance } from '../lib/Instance'

export interface IComputed<T> {
  get(): T
}

export class Computed<T> extends Observer implements IComputed<T> {
  public get isStale(): boolean {
    return this._isStale
  }
  public type = ObserverType.Computed
  public dependencyPaths: string[] = []
  public readonly fun: (isInitialRun?: true) => T
  private value!: T | IObservable<T>
  private isAlive: boolean = false
  private isIinitialized = false
  private valueContext: IContainer
  private readonly isObservableValue: boolean
  private readonly isStrict: boolean

  constructor(fun: (boundThis?: IObservable<any>) => T, options?: ComputedOptions) {
    super('Computed#', options?.contexts?.source)
    this.fun = fun
    this.isObservableValue = options?.isObservable ?? true
    this.valueContext = options?.contexts?.output || this.context
    this.isStrict = options && options.useOptional !== undefined
      ? options.useOptional
      : true
  }

  public get(target?: IObservable<any>): T | IObservable<T> {    

    // Bypass if no reaction is running. That means that the user force the update.
    if (this.valueContext.isRunningReaction) {
      this.valueContext.registerComputedSource(this)
    }
    if (this._isStale) {
      this.runAndUpdateDeps(target)
      // If the computed value is an observable, add the observable value
      // if not, add this id.
      if (isInstance(this.value)) {
        this.valueContext.addObservedPath(this.value.$id)
      } else {
        this.valueContext.addObservedPath(this.id)
      }
    }

    return this.value
  }

  public get valueId(): string{
    return isInstance(this.value)
      ? this.value.$id
      : this.id
  }

  public dispose = (): void => {
    this._isStale = true
    this.isAlive = false
    if (isInstance(this.value)) {
      this.valueContext.unregisterAsReferencable(this.id)
    }
  }

  public runAndUpdateDeps(target?: IObservable<any>): void {
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
      // This computed value is not observable
      if (!this.isObservableValue) {
        this.value = value
      } 
      // The computation return a leaf instance
      else if (value instanceof LeafInstance) {
        this.value = value.$data
      }
      // The computation return a primitive
      else if (isPrimitive(value)) {
        this.value = value
      }
      // The computation return an object
      else {
        this.value = observable(value, { context: this.valueContext, isStrict: this.isStrict })
      }

      this.isIinitialized = true
    }
    // The observer has already ran. We update the observable value.
    // Note this $setValue won't emit any patch, because it only happens during the learning phase.
    else {
      if (isNode(this.value)) {
        this.valueContext.transaction(() => toNode(this.value).$setValue(value))
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
  isObservable?: boolean
  useOptional?: boolean
  contexts?: {output?: IContainer, source?: IContainer}
}

export function computed<T>(fun: (boundThis?: IObservable<any>) => T, options?: ComputedOptions): IComputed<T> {
  return new Computed(fun, options)
}
