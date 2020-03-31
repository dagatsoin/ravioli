import { Mutation, Acceptor } from './Acceptor'
import { PackagedActions, Actions } from './Action'
import { IComponentInstance } from './IComponentInstance'
import { Proposal } from './IPresentable'
import { IType, Migration, ToLiteral, IContainer } from '@warfog/crafter'

export type ComponentOptions = {
  keepLastControlStateIfUndefined?: boolean
  contexts?: {
    private?: IContainer
    public?: IContainer
  }
  // Work only for custom representation.
  // Will debounce the reaction to the representation update
  // until all step reactions are handled.
  debounceReaction?: boolean
}

export type InstanceOptions = {
  contexts?: {
    private?: IContainer
    public?: IContainer
  }
}

export interface IComponentFactory<
  TYPE,
  VALUE,
  MUTATIONS extends Mutation<any, any> = { type: never; payload: never; },
  CONTROL_STATES extends string = never,
  ACTIONS = any,
  TRANSFORMATION extends TYPE = TYPE,
  NAP_NAMES extends string = never
> {
  type: IType<TYPE, VALUE>
  packagedActions: ACTIONS
  Mutations: MUTATIONS
  controlStatePredicates: Map<
    CONTROL_STATES,
    CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>
  >
  transformations: [
    string,
    Transformation<TYPE> | {
      predicate?: RepresentationPredicate<TYPE, MUTATIONS, CONTROL_STATES>
      computation: Transformation<TYPE>
    }
  ][]
  create(
    value?: VALUE,
    options?: InstanceOptions
  ): IComponentInstance<TYPE, TRANSFORMATION, ACTIONS, MUTATIONS>
  addAcceptor<N extends string, F extends AcceptorFactory<TYPE>>(
    name: N,
    factory: F
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS | Mutation<N, FactoryParameters<F>>,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION
  >
  removeAcceptor<ACCEPTOR_NAME extends MutationName<MUTATIONS>>(
    acceptorName: ACCEPTOR_NAME
  ): IComponentFactory<
    TYPE,
    VALUE,
    Exclude<MUTATIONS, Mutation<ACCEPTOR_NAME, any>>,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION
  >
  addActions<P extends PackagedActions<CONTROL_STATES, MUTATIONS>>(
    actions: P
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS & Actions<CONTROL_STATES, MUTATIONS, P>,
    TRANSFORMATION
  >
  removeAction<ACTION_NAME extends keyof ACTIONS>(
    actionName: ACTION_NAME
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    Omit<ACTIONS, ACTION_NAME>,
    TRANSFORMATION
  >
  setControlStatePredicate<I extends string>(
    id: I,
    predicate: CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES | ToLiteral<I>,
    ACTIONS,
    TRANSFORMATION,
    NAP_NAMES
  >
  removeControlState<CONTROL_STATE extends CONTROL_STATES>(
    id: CONTROL_STATE
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    Exclude<CONTROL_STATES, CONTROL_STATE>,
    ACTIONS,
    TRANSFORMATION,
    NAP_NAMES
  >
  hasControlState(name: string): boolean
  setTransformation<
    C extends Transformation<TYPE>
  >(
    id: string,
    representation: C | {
      predicate?: RepresentationPredicate<TYPE, MUTATIONS, CONTROL_STATES>
      computation: C
    }
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION & ReturnType<C>
  >
  removeTransformation(
    id: string
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION,
    NAP_NAMES
  >
  addStepReaction<
    I extends string,
    R extends StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS>
  >(
    id: I,
    reaction: R
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION,
    NAP_NAMES | ToLiteral<I>
  >
  getNAP(): Map<string, StepReaction<TYPE, MUTATIONS, CONTROL_STATES, ACTIONS>>
  hasNAP(NAPName: string): boolean
  removeNap<NAP_NAME extends NAP_NAMES>(
    id: NAP_NAME
  ): IComponentFactory<
    TYPE,
    VALUE,
    MUTATIONS,
    CONTROL_STATES,
    ACTIONS,
    TRANSFORMATION,
    Exclude<NAP_NAMES, NAP_NAME>
  >
}

export interface IWithAcceptorFactories<T> {
  getAcceptorFactory(acceptorName: string): AcceptorFactory<T> | undefined
  hasAcceptorFactory(acceptorName: string): boolean
}

// Helper type. Get the payload type of a mutator.
export type FactoryParameters<F extends AcceptorFactory<any>> = Parameters<
  ReturnType<F>['mutator']
>[0]

// Helper type. Extract all mutations names.
export type MutationName<F extends Mutation<any, any>> = F['type']

export type AcceptorFactory<T, P = any> = (model: T) => Acceptor<P>

export type Predicate<TYPE, MUTATION extends Mutation<any, any>, CONTROL_STATES extends string, LEAF> =
  | PredicateFunction<TYPE, MUTATION, CONTROL_STATES>
  | PredicateTree<LEAF>

export type CSPredicate<
  TYPE,
  MUTATIONS extends Mutation<any, any>,
  CONTROL_STATES extends string = never
> = Predicate<TYPE, MUTATIONS, CONTROL_STATES, CONTROL_STATES | { previous: CONTROL_STATES }>
export type RepresentationPredicate<TYPE, MUTATION extends Mutation<any, any>, CONTROL_STATES extends string> = Predicate<TYPE, MUTATION, CONTROL_STATES, CONTROL_STATES>

export type PredicateFunction<
  T,
  MUTATION extends Mutation<any, any>,
  CONTROL_STATES = string
> = (args: {
  model: T
  previousControlStates: CONTROL_STATES[]
  acceptedMutations: MUTATION[]
}) => boolean

export type Delta<TYPE, MUTATION, CONTROL_STATES_PREDICATES> = {
  previousSnapshot: TYPE
  acceptedMutations: MUTATION[]
  proposal: Proposal<MUTATION>
  controlStates: CONTROL_STATES_PREDICATES[]
  previousControlStates: CONTROL_STATES_PREDICATES[]
  migration: Migration
}

export type Transformation<TYPE> = (model: TYPE) => any

export type StepReaction<TYPE, MUTATION, CONTROL_STATES_PREDICATES, ACTIONS> = {
  predicate?(
    args: {
      delta: Delta<TYPE, MUTATION, CONTROL_STATES_PREDICATES>
      model: TYPE      
    }
  ): boolean
  effect(
    args: {
      delta: Delta<TYPE, MUTATION, CONTROL_STATES_PREDICATES>
      model: TYPE      
    },
    actions: ACTIONS
  ): void
}

export type PredicateTree<Leaf> = BooleanNode<Leaf>

type BooleanNode<BooleanLeaf> =
  | BooleanLeaf
  | { and: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { or: (BooleanLeaf | BooleanNode<BooleanLeaf>)[] }
  | { not: BooleanNode<BooleanLeaf> }