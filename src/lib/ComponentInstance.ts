import {
  IPresentable,
  Proposal,
  Acceptors,
  AcceptorsFactory,
  ActionPackages,
  Actions,
} from '../api'
import { INodeType, INodeInstance } from '../vendor/crafter'

export class ComponentInstance<ACTIONS, TYPE extends INodeType<any>>
  implements IPresentable<any> {
  private acceptors: Acceptors<any>
  private data: INodeInstance<TYPE>
  private _actions: Actions<any>

  public get actions(): ACTIONS {
    return this._actions
  }

  constructor(
    packagedActions: ActionPackages<any>,
    acceptorsFactory: AcceptorsFactory<any>,
    data: INodeInstance<TYPE>
  ) {
    this.unpackActions(packagedActions)
    this.acceptors = acceptorsFactory(data)
    this.data = data
  }

  private unpackActions(actionsPackage: ActionPackages<any>) {
    this._actions = Object.keys(actionsPackage).map(key => ({
      [key]: function(payload: any) {
        if (actionsPackage[key]['isAllowed']) {
          actionsPackage[key]['action'](payload)
        } else {
          console.warn(`Action ${key} is not allowed`)
        }
      },
    }))
  }

  present(proposal: Proposal<any>) {
    this.data.$isLocked = false
    try {
      this.data.$patch = []
      proposal
        // Accept or reject the mutation
        .filter(mutation =>
          this.acceptors[mutation.type].condition(mutation.payload)
        )
        // Do the mutation
        .forEach(mutation =>
          this.acceptors[mutation.type].mutator(mutation.payload)
        )
    } catch (e) {
      console.error(e)
    } finally {
      this.data.$isLocked = true
      Manager.dispatchOperations(this.data.$patch)
    }
  }
}
