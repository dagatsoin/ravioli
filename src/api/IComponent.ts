import { Operation } from 'fast-json-patch'

import { Acceptors } from './Acceptor'
import { ActionPackages, Actions } from './Action'
import { IComponentInstance } from './IComponentInstance'

export interface IComponent<
  TRANSFORMATION = any,
  MUTATION_PAYLOADS = any,
  CONTROL_STATES_PREDICATES = any,
  ACTIONS = any,
  TYPE = any
> {
  actions: ACTIONS
  controlStatePredicates: CONTROL_STATES_PREDICATES
  mutationsPayloads: MUTATION_PAYLOADS
  create(value?: TYPE): IComponentInstance<ACTIONS, TRANSFORMATION>
  addAcceptors<F extends AcceptorsFactory<TYPE>>(
    factory: F
  ): IComponent<
    TRANSFORMATION,
    MUTATION_PAYLOADS & MutationPayloads<F>,
    CONTROL_STATES_PREDICATES,
    ACTIONS,
    TYPE
  >
  addActions<P extends ActionPackages<MUTATION_PAYLOADS>>(
    actions: P
  ): IComponent<
    TRANSFORMATION,
    MUTATION_PAYLOADS,
    CONTROL_STATES_PREDICATES,
    ACTIONS & Actions<P>,
    TYPE
  >
  addControlStates<C extends ControlStates<TYPE>>(
    controlStatePredicates: C
  ): IComponent<
    TRANSFORMATION,
    MUTATION_PAYLOADS,
    CONTROL_STATES_PREDICATES & C,
    ACTIONS,
    TYPE
  >
  addRepresentation<
    C extends RepresentationComputation<
      TYPE,
      MUTATION_PAYLOADS,
      CONTROL_STATES_PREDICATES
    >
  >(
    /*predicate: RepresentationPredicate, */ computation: C
  ): IComponent<
    TRANSFORMATION & ReturnType<C>,
    MUTATION_PAYLOADS,
    CONTROL_STATES_PREDICATES,
    ACTIONS,
    TYPE
  >
  addReaction(
    nap: NAPComputation<TYPE, MUTATION_PAYLOADS, CONTROL_STATES_PREDICATES>
  ): IComponent<
    TRANSFORMATION,
    MUTATION_PAYLOADS,
    CONTROL_STATES_PREDICATES,
    ACTIONS,
    TYPE
  >
}

export interface IWithAcceptors<P> {
  acceptors: Acceptors<P>
}

// This type will help with auto completion for coding the proposal. It extract all
// the payloads from the registered mutations. You are welcome.
export type MutationPayloads<
  F extends AcceptorsFactory<any>
> = PayloadTypeDictionnary<F>[keyof PayloadTypeDictionnary<F>]

// This type is an helper for above. It turns all the acceptors function on a dictionnary of payload type.
type PayloadTypeDictionnary<F extends AcceptorsFactory<any>> = {
  [K in keyof ReturnType<F>]: {
    type: K
    payload: Parameters<ReturnType<F>[K]['mutator']>[0]
  }
}

export type AcceptorsFactory<T, P extends object = {}> = (
  model: T
) => Acceptors<P>

export type ControlStates<T> = { [key: string]: (model: T) => boolean }

type StateComputationArgs<
  TYPE,
  MUTATION_PAYLOADS,
  CONTROL_STATES_PREDICATES
> = {
  model: TYPE
  previousModel: TYPE
  acceptedMutations: MUTATION_PAYLOADS[]
  controlState: keyof CONTROL_STATES_PREDICATES
  previousControlState: keyof CONTROL_STATES_PREDICATES
  patch: Operation
}

export type RepresentationComputation<
  TYPE,
  MUTATION_PAYLOADS,
  CONTROL_STATES_PREDICATES
> = (
  args: StateComputationArgs<TYPE, MUTATION_PAYLOADS, CONTROL_STATES_PREDICATES>
) => any

export type NAPComputation<
  TYPE,
  MUTATION_PAYLOADS,
  CONTROL_STATES_PREDICATES
> = (
  args: StateComputationArgs<TYPE, MUTATION_PAYLOADS, CONTROL_STATES_PREDICATES>
) => MUTATION_PAYLOADS[]
