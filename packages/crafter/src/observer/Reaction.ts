import { Observer, ObserverType } from './Observer'
import { IContainer } from '../IContainer'

type TrackedFunction = (p:{isFirstRun: boolean, dispose: () => void}) => void
type SideEffect = (p:{isFirstRun: boolean, dispose: () => void}) => void

export class Reaction extends Observer {
  public dependencyPaths: string[] = []
  public type = ObserverType.Autorun
  public get isStale(): boolean {
    return this._isStale
  }
  private reaction: SideEffect
  private action?: TrackedFunction

  constructor(sideEffect: SideEffect, context?: IContainer) {
    super({
      type: ObserverType.Reaction,
      context
    })
    this._isStale = false
    this.reaction = sideEffect
  }

  public observe(spiedFunction: TrackedFunction): void {
    this.action = spiedFunction
    this._isStale = false
    this.context.initReaction(this)
  }

  public dispose = (): void => {
    // todo extract to super()
    // Maybe the autorun was running
    this.context.stopSpyDerivation(this.id)
    this.context.onDisposeObserver(this.id)
  }

  public runAndUpdateDeps(): void {
    if (this.action) {
      let isSpying = false
      try{
        if (!this._isStale) {
          this.context.startSpyReaction(this.id)
          isSpying = true
          this.action({isFirstRun: true, dispose: this.dispose})
          this.dependencyPaths = this.context.stopSpyReaction(this.id)
          isSpying = false
        } else {
          this.reaction({isFirstRun: false, dispose: this.dispose})
        }
        
    } catch (e) {
        this.context.onObserverError(this.id)
        if (isSpying) {
          this.context.stopSpyReaction(this.id)
        }
        throw e
      }
    }
  }
}