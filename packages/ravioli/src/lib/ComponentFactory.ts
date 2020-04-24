import { PackagedActions } from '../api/Action'
import {
  AcceptorFactory,
  IComponentFactory,
  IWithAcceptorFactories,
  StepReaction,
  Transformation,
  MutationName,
  PredicateFunction,
  ComponentOptions,
  CSPredicate,
  RepresentationPredicate,
  InstanceOptions,
} from '../api/IComponentFactory'
import { IComponentInstance } from '../api/IComponentInstance'
import { isNodeType, IType, IObservable, IInstance } from '@warfog/crafter'
import { ComponentInstance, TransformationPackage } from './ComponentInstance'
import { check } from './helpers'
import { Mutation } from '../api/Acceptor'

export class ComponentFactory<
  TYPE = any,
  VALUE = any,
  MUTATIONS extends Mutation<any, any> = { type: never },
  CONTROL_STATES extends string = never,
  ACTIONS = any,
  REPRESENTATION extends IObservable = IInstance<TYPE>,
  NAP_NAMES extends string = never
>
  implements
    IComponentFactory<
      TYPE,
      VALUE,
      MUTATIONS,
      CONTROL_STATES,
      ACTIONS,
      REPRESENTATION,
      NAP_NAMES
    >,
    IWithAcceptorFactories<TYPE> {
  public get Mutations(): MUTATIONS {
    throw new Error('[Ravioli] IComponentFactory.Mutations is just a helper field for linting and may not be used at runtime.')
  }
  public controlStatePredicates: Map<
    CONTROL_STATES,
    CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>
  > = new Map()
  public type: IType<TYPE, VALUE>
  public packagedActions: ACTIONS = {} as ACTIONS
  public NAPs: Map<
    NAP_NAMES,
    StepReaction<TYPE, REPRESENTATION, MUTATIONS, CONTROL_STATES, ACTIONS>
  > = new Map()
  public transformations: TransformationPackage<TYPE, MUTATIONS, CONTROL_STATES>[] = []
  private acceptorFactories: Map<string, AcceptorFactory<any>> = new Map()
  private options?: ComponentOptions
  
  constructor(type: IType<TYPE, VALUE>, options?: ComponentOptions) {
    check(
      () => isNodeType(type),
      `Invalid argument for Model constructor. Expecting a IType<T>. Got ${typeof type}`
    )
    this.type = type
    this.options = options
  }
  public getAcceptorFactory = (
    acceptorName: string
  ): AcceptorFactory<any> | undefined => this.acceptorFactories.get(acceptorName)
  public hasAcceptorFactory = (acceptorName: string): boolean => this.acceptorFactories.has(acceptorName)


  public create(
    value?: VALUE,
    options?: InstanceOptions
  ): IComponentInstance<TYPE, REPRESENTATION, ACTIONS, MUTATIONS> {
    return new ComponentInstance({
      factory: this as any,
      data: value,
      options: {
        ...this.options,
        ...options
      }
    })
  }

  public applySnapshot(_data: any): void {
    throw new Error('Method not implemented.')
  }

  /**
   * This will normalize the factory to quickly retrieve the corresponding
   * acceptors group.
   * The factory is run once and all its keys (acceptor names) will be mapped
   * to the correpsonding factory index.
   * input:
   * model => ({acceptor0: ..., acceptor2})
   * output:
   * map with entries [["acceptor0", 0],["acceptor1", 0]]
   */
  public addAcceptor(
    acceptorName: string,
    factory: AcceptorFactory<TYPE>
  ): any {
    this.acceptorFactories.set(acceptorName, factory)
    return this
  }

  public removeAcceptor<ACCEPTOR_NAME extends MutationName<MUTATIONS>>(
    acceptorName: ACCEPTOR_NAME
  ): any {
    this.acceptorFactories.delete(acceptorName)
    return this
  }

  public addActions<P extends PackagedActions<any, any>>(
    packagedActions: P
  ): any {
    this.packagedActions = {
      ...this.packagedActions,
      ...packagedActions,
    }
    return this
  }

  public removeAction(actionName: any): any {
    delete (this.packagedActions as any)[actionName]
    return this
  }

  public setControlStatePredicate(
    id: string,
    predicate: PredicateFunction<TYPE, MUTATIONS, CONTROL_STATES>
  ): any {
    this.controlStatePredicates.set(id as any, predicate)
    return this
  }

  public removeControlState<I extends CONTROL_STATES>(id: I): any {
    this.controlStatePredicates.delete(id)
    return this
  }

  public hasControlState(name: string): boolean {
    return this.controlStatePredicates.has(name as never)
  }

  public setTransformation<
    C extends Transformation<TYPE>
  >(
    id: string,
    transformer: C | {
      predicate?: RepresentationPredicate<TYPE, MUTATIONS, CONTROL_STATES>
      computation: C
    },
    isBoxed: boolean = false
  ): any {
    const existingRepresentation = this.transformations.find(({id: _id}) => id === _id)
    if (existingRepresentation) {
      existingRepresentation[1] = transformer
    } else {
      this.transformations.push({id, transformer, isBoxed})
    }
    return this
  }

  public removeTransformation(id: string): any {
    this.transformations.splice(this.transformations.findIndex(({id: _id}) => _id === id), 1)
    return this
  }

  public addStepReaction<
    N extends StepReaction<TYPE, REPRESENTATION, MUTATIONS, CONTROL_STATES, ACTIONS>
  >(id: string, nap: N): any {
    this.NAPs.set(id as any, nap)
    return this
  }
  public hasNAP(NAPName: string): boolean {
    return this.NAPs.has(NAPName as any)
  }
  public getNAP(): Map<
    string,
    StepReaction<TYPE, REPRESENTATION, MUTATIONS, CONTROL_STATES, ACTIONS>
  > {
    return this.NAPs
  }
  public removeNap<NAP_NAME extends NAP_NAMES>(id: NAP_NAME): any {
    this.NAPs.delete(id)
    return this
  }
}
