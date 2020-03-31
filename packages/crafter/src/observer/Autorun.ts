import { ObserverType, Observer, IObserver } from './Observer'
import { IContainer } from '../IContainer'

type AutorunFunction = (p:{isFirstRun: boolean, dispose: () => void}) => void

export class Autorun extends Observer {
  public dependencyPaths: string[] = []
  public type = ObserverType.Autorun
  public get isStale(): boolean {
    return this._isStale
  }
  private fun: AutorunFunction
  private isFirstRun = true

  constructor(fun: AutorunFunction, context?: IContainer) {
    super('Autorun#', context)
    this.fun = fun
    this.context.initReaction(this)
  }

  public isDependent(observableId: string): boolean {
    return this.dependencyPaths.some(path => path.includes(observableId))
  }

  public dispose = (): void => {
    this._isStale = true
    // todo extract to super()
    // Maybe the autorun was running
    this.context.stopSpyDerivation(this.id)
    this.context.onDisposeObserver(this.id)
  }

  public runAndUpdateDeps(): void {
    if (this._isStale) {
      let error
      this.context.startSpyReaction(this.id)
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
        this.context.onObserverError(this.id)
        error = e
      } finally {
        this.dependencyPaths = this.context.stopSpyReaction(this.id)
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
