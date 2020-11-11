import { Observer } from './Observer'
import { IObserver, ObserverType } from "./IObserver"
import { IContainer } from '../IContainer'

type AutorunFunction = (p:{isFirstRun: boolean, dispose: () => void}) => void

export class Autorun extends Observer {
  public type = ObserverType.Autorun
  private fun: AutorunFunction
  private isFirstRun = true

  constructor(fun: AutorunFunction, context?: IContainer) {
    super({
      type: ObserverType.Autorun,
      context
    })
    this.fun = fun
    this.context.registerObserver(this)
    // Run the target function and collect all the observers popping up during execution.
    this.runAndUpdateDeps() 
  }

  public dispose = (): void => {
    this._isStale = true
    // todo extract to super()
    // Maybe the autorun was running
    this.context.stopSpyObserver(this.id)
    this.context.onDisposeObserver(this)
  }

  public runAndUpdateDeps(): void {
    if (this._isStale) {
      let error
      this.context.startSpyObserver(this)
      try {
        this.fun({isFirstRun: this.isFirstRun, dispose: this.dispose})
        if (this.isFirstRun) {
          this.isFirstRun = false
        }
      } catch(e) {
        // Can't dispose during init
        if (!this.isFirstRun) {
          this.dispose()
        }
        this.context.onObserverError(this)
        error = e
      } finally {
        this.context.stopSpyObserver(this.id)
        this._isStale = false
      }
      if (error) {
        throw error
      }
    }
  }
}

export function autorun(fun: AutorunFunction, context?: IContainer): () => void {
  return new Autorun(fun, context).dispose
}

export function isAutorun(observer: IObserver): observer is Autorun {
  return observer.type === ObserverType.Autorun
}
