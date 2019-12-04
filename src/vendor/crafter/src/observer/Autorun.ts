import { Operation } from '../lib/JSONPatch'
import * as Manager from '../STManager'
import { IObserver, ObserverType } from './Observer'

export type DependencyNames = string[]

export type TransactionPatch = Array<[string, Operation[]]>

export class Autorun implements IObserver {
  public dependenciesPath: string[] = []
  public $id: string
  public type = ObserverType.Autorun
  public isStale = true
  private fun: (isFirstRun: boolean) => void

  constructor(fun: () => void) {
    this.fun = fun
    this.$id = 'Autorun' + Manager.UID()
    Manager.initComputation(this)
  }

  public isDependent(observableId: string): boolean {
    return this.dependenciesPath.some(path => path.includes(observableId))
  }

  public dispose = () => {
    this.isStale = true
    // todo extract to super()
    Manager.onDisposeObserver(this.$id)
  }

  public runAndUpdateDeps() {
    if (this.isStale) {
      Manager.startSpyObserver(this.$id)
      this.fun(true)
      this.dependenciesPath = Manager.stopSpyObserver(this.$id)
    }
  }
}

export function autorun(fun: () => void): () => void {
  return new Autorun(fun).dispose
}
