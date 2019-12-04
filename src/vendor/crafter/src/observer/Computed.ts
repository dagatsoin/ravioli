import { getNode } from '../helpers'
import { IObservable } from '../IObservable'
import { IType } from '../lib/IType'
import { Operation } from '../lib/JSONPatch'
import { observable } from '../lib/observable'
import * as Manager from '../STManager'
import { IObserver, ObserverType } from './Observer'

export class Computed<T> implements IObserver, IObservable {
  public $isObservable: true = true
  public $patch: Operation[]
  public isStale: boolean = true
  public type = ObserverType.Computed
  public dependenciesPath: string[] = []
  public $id: string
  private fun: (isInitialRun?: true) => T
  private value: T & IObservable
  private isAlive: boolean = false
  private valueType?: IType<T>
  private isIinitialized = false

  constructor(fun: () => T, type?: IType<T>) {
    this.fun = fun
    this.valueType = type
    this.$id = 'Compute' + Manager.UID()
  }

  public $transactionDidEnd() {}

  public get(): T & IObservable {
    Manager.addObservedPath(this.$id)
    if (this.isStale) {
      this.runAndUpdateDeps()
    }

    return this.value
  }

  public isDependent(observableId: string): boolean {
    return this.dependenciesPath.some(path => path.includes(observableId))
  }

  public dispose = () => {
    this.isStale = true
    this.isAlive = false
    Manager.onDisposeObserver(this.$id)
  }

  public runAndUpdateDeps() {
    if (this.isStale) {
      // The observer run for the first time or is re employed by an other observer
      if (
        !this.isAlive &&
        (Manager.isRunningTopLevelObserver() || Manager.isLearning())
      ) {
        Manager.addComputedSource(this)
        this.isAlive = true
      }
      // Listen to all the observable path this computation will access to.
      // This will set a list of dependencies.
      // Each time a dependency change, we will know that this observable will be stale.

      // FIX ME:
      // Useless additional read path are generated when creating the observable value.
      // Reproduction: create a computed value which depends on another computed value which
      // depends on an observable object.
      // When creating the root observable, the factory will deep copy each properties of the object
      // generating read signals for each property.
      // Workaround: Compute the value BEFORE setting it in the observable to prevent and PAUSE spies
      // during the creation.
      Manager.startSpyObserver(this.$id)
      const value = this.fun()
      this.dependenciesPath = Manager.stopSpyObserver(this.$id)

      Manager.pauseSpies()
      // The observer run for the first. We set the observable result.
      if (!this.isIinitialized) {
        this.value = observable(value, {
          type: this.valueType,
          id: this.$id,
        })
        this.isIinitialized = true
      }
      // The observer has already ran. We update the observable value.
      // Note this $setValue won't emit any patch, because it only happens during the learning phase.
      else {
        getNode<T>(this.value).$setValue(value)
      }
      Manager.resumeSpies()
    }
    this.isStale = false
  }
}

export function computed<T>(fun: () => T): Computed<T> {
  return new Computed(fun)
}
