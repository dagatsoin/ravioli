import * as Manager from './STManager'
import {
  IComponent,
  ControlStates,
  AcceptorsFactory,
  RepresentationComputation,
  NAPComputation,
  IWithAcceptors,
} from '../api/IComponent'
import { Acceptors } from '../api/Acceptor'
import { IType, isNodeType, INodeInstance } from '../vendor/crafter'
import { Action, ActionPackages, Actions } from '../api/Action'
import { check } from './helpers'
import { createReactiveTransformation } from './Representation'
import { IComponentInstance } from '../api/IComponentInstance'

//type MutatorsFactory<T> = (model: T) => { [key: string]: Mutator<T, any> };

export class Component<
  REPRESENTATION = any,
  MUTATION_PAYLOADS = any,
  CONTROL_STATES_PREDICATES extends ControlStates<any> = any,
  ACTIONS = any,
  TYPE = any
>
  implements
    IComponent<
      REPRESENTATION,
      MUTATION_PAYLOADS,
      CONTROL_STATES_PREDICATES,
      ACTIONS,
      TYPE
    >,
    IWithAcceptors<TYPE> {
  public mutationsPayloads: MUTATION_PAYLOADS
  public controlStatePredicates: CONTROL_STATES_PREDICATES
  public acceptors: Acceptors<any>
  public type: IType<TYPE>
  public get representation() {
    return this.currentRepresentation
  }

  private _representationComputation: RepresentationComputation<
    TYPE,
    MUTATION_PAYLOADS,
    CONTROL_STATES_PREDICATES
  >
  private currentRepresentation: REPRESENTATION
  public actions: ACTIONS

  constructor(type: IType<TYPE>) {
    check(
      () => isNodeType(type),
      `Invalid argument for Model constructor. Expecting a IType<T>. Got ${typeof type}`
    )
    this.type = type
    //    Manager.addObservable(this._data);
    //this.data.$onRead = addObservedPath;
  }

  create(value?: TYPE): IComponentInstance<ACTIONS, REPRESENTATION> {
    this.type.create(value)
    return {
      actions: this.actions,
      state: {
        representation: this.currentRepresentation,
        controlState: 'ready',
      },
    }
  }

  applySnapshot(data: any): void {
    throw new Error('Method not implemented.')
  }

  addAcceptors(
    factory: AcceptorsFactory<TYPE>
  ): IComponent<any, any, any, any, any> {
    this.acceptors = {
      ...this.acceptors,
      ...factory(this.data),
    }
    return this
  }

  addActions<P extends ActionPackages<MUTATION_PAYLOADS>>(
    packagedActions: P
  ): IComponent<any, any, any, any, any> {
    this.actions = {
      ...this.actions,
      ...this.bindActions(packagedActions),
    }
    return this
  }

  addControlStates(
    controlStatePredicates: ControlStates<TYPE>
  ): IComponent<any, any, any, any, any> {
    this.controlStatePredicates = {
      ...controlStatePredicates,
      ...this.controlStatePredicates,
    }
    this.controlStatePredicates = controlStatePredicates as CONTROL_STATES_PREDICATES
    return this
  }

  addRepresentation(
    computation: RepresentationComputation<
      TYPE,
      MUTATION_PAYLOADS,
      CONTROL_STATES_PREDICATES
    >
  ): IComponent<any, any, any, any, any> {
    this._representationComputation = createReactiveTransformation(
      this.data,
      computation
    )
    return this
  }

  addReaction(
    nap: NAPComputation<TYPE, MUTATION_PAYLOADS, CONTROL_STATES_PREDICATES>
  ): IComponent<any, any, any, any, any> {
    this.naps
    return this
  }

  present(proposal: Proposal<MUTATION_PAYLOADS>) {
    this.data.$isLocked = false
    try {
      this.data.$patch = []
      proposal.forEach(mutation =>
        this.acceptors[mutation.type]({
          model: this.data,
          payload: mutation.payload,
        })
      )
    } catch (e) {
      console.error(e)
    } finally {
      this.data.$isLocked = true
      Manager.dispatchOperations(this.data.$patch)
    }
  }

  private bindActions<P extends ActionPackages<MUTATION_PAYLOADS>>(
    packagedActions: P
  ): Actions<ActionPackages<MUTATION_PAYLOADS>> {
    let ret: Actions<any> = {}
    for (let key in packagedActions) {
      ret[key] = this.bindAction(packagedActions[key].action)
    }
    return ret
  }

  private bindAction<P>(action: Action<P>): (payload: P) => void {
    return (payload: P) => {
      this.present(action(payload))
    }
  }
}

function addObservedPath(path: string) {
  const node: INodeInstance<any> = this
  if (node.$isRunningInSandBox) {
    Manager.addObservedPath(path)
  }
}

export function getComponent(comp: IComponent): Component {
  return comp as Component
}
