import {
  IComponentInstance,
  ISAMLoop,
  Transformation,
  State,
  IComponentFactory,
  IWithAcceptorFactories,
  AcceptorFactory,
  IEnhancabble,
  TaggedProposal,
  PackagedActions,
  Reaction,
  Proposal,
  Mutation,
  Actions,
  Delta,
  PredicateFunction,
  ActionContext,
  ComponentOptions,
  CSPredicate,
  RepresentationPredicate,
  IActionCacheReset
} from '../api'
import { getContext, IInstance, toNode, clone, toInstance, CrafterContainer, getGlobal, createTransformer, ITransformer } from 'crafter'
import { createNAPProposalBuffer, IProposalBuffer } from './NAPProposalBuffer'
import { Migration } from 'crafter/src/lib/JSONPatch'
import { IContainer } from 'crafter/src/IContainer'
import { IObservable } from 'crafter/src/IObservable'

export type TransformationPackage<TYPE, MUTATIONS, CONTROL_STATES extends string> = [
  string,
  Transformation<TYPE> | {
    predicate?: RepresentationPredicate<TYPE, MUTATIONS, CONTROL_STATES>
    computation: Transformation<TYPE>
  }
]

export class ComponentInstance<
  TYPE,
  VALUE,
  MUTATION,
  CONTROL_STATES extends string,
  ACTIONS,
  REPRESENTATION extends IObservable<any>,
  MUTATIONS extends Mutation<any, any>
>
  implements
    ISAMLoop,
    IComponentInstance<TYPE, REPRESENTATION, ACTIONS, MUTATIONS>,
    IEnhancabble,
    IActionCacheReset {
  
  public Type: TYPE
  public readonly state: State<REPRESENTATION, CONTROL_STATES>
  private isStale: boolean = true
  private isRunningNAP: boolean = false
  private _originalActions: ACTIONS = {} as ACTIONS
  private _wrapedActions: ACTIONS = {} as ACTIONS
  private data: IInstance<TYPE, VALUE>
  private factory: IComponentFactory<TYPE, VALUE, any> &
    IWithAcceptorFactories<any>
  private stepMigration: Migration = { forward: [], backward: [] }
  private options?: ComponentOptions
  private NAPproposalBuffer: IProposalBuffer<
    MUTATION
  > = createNAPProposalBuffer<MUTATION>()
  private acceptorFactories: Map<string, AcceptorFactory<TYPE>> = new Map()
  private NAPs: Map<string, Reaction<any, any, any, any>> = new Map()
  private controlStatePredicates: Map<
    CONTROL_STATES,
    CSPredicate<TYPE, MUTATIONS, CONTROL_STATES>
  > = new Map()
  private transformations: TransformationPackage<TYPE, MUTATIONS, CONTROL_STATES>[] = []
  private currentTransformation?: { id: string, transformer: ITransformer<IInstance<TYPE, any>, REPRESENTATION> }
  private packagedActions: PackagedActions<any, any> = {}
  private privateContext: IContainer
  private publicContext: IContainer

  /**
   * Memoize wrapped actions
   */
  public get actions(): ACTIONS {
    if (this.isStale) {
      this.rebuildActionsCache()
      this.isStale = false
    }
    return this._wrapedActions
  }

  /**
   * Return original action to use during composition.
   */
  private get originalActions(): ACTIONS {
    if (this.isStale) {
      this.rebuildActionsCache()
      this.isStale = false
    }
    return this._originalActions
  }

  constructor({
    factory,
    data,
    options,
  }: {
    factory: IComponentFactory<TYPE, VALUE, any> & IWithAcceptorFactories<any>
    data: VALUE
    options?: ComponentOptions
  }) {
    this.factory = factory
    this.options = options
    this.privateContext = options?.contexts?.private || new CrafterContainer()
    this.publicContext = options?.contexts?.public || getGlobal().$$crafterContext
    this.data = toInstance<any>(this.factory.type.create(data))
    toNode(this.data).$addTransactionPatchListener(
      migration => (this.stepMigration = migration)
    )
    const controlStates = getControlStates<
      CONTROL_STATES
    >({
      instanceControlStatePredicates: this.controlStatePredicates,
      factoryControlStatePredicates: this.factory.controlStatePredicates,
      previousControlStates: [],
      model: this.data,
      acceptedMutations: [],
    })

    const initialTransformationPackage = getTransformationPackage({
      controlStates,
      previousControlStates: [],
      model: this.data,
      acceptedMutations: [],
      instanceTransformations: this.transformations,
      factoryTransformations: this.factory.transformations
    })

    if (initialTransformationPackage !== undefined) {
      this.currentTransformation = {
        id: initialTransformationPackage.id,
        transformer: createTransformer(
          initialTransformationPackage.computation,
          {
            contexts: {
              source: this.privateContext,
              output: this.publicContext
            }
          })
      }
    }
    const stepId = new Date().getTime().toString()

    if (this.currentTransformation === undefined) {
      this.state = {
        controlStates,
        representation: clone<any>(this.data),
        stepId
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this
      this.state = {
        controlStates,
        get representation(): REPRESENTATION {
          return self.currentTransformation!.transformer(self.data)
        },
        stepId
      }  
    }
  }
  public rebuildActionsCache(): void {
    this._originalActions = {} as any
    this._wrapedActions = {} as any
    Object.keys(this.factory.packagedActions)
      .concat(Object.keys(this.packagedActions)) // Aggregate the static and instance actions name
      .filter((k, i, self) => self.indexOf(k) === i) // remove duplicate
      .map(key => {
        // Instance action override the static action
        // If the action name is present in the instance we look in the instance action store
        // if not we retrieve the static store

        const store =
          key in this.packagedActions
            ? this.packagedActions
            : this.factory.packagedActions

        const type = typeof store[key]
        const action = (payload: any): Mutation<any, any>[] => [{ type: store[key], payload }]
        switch (type) {
          case 'string':
            // The dev used a shortcul action.
            // Create an action which return the correct proposal.
            this._originalActions[store[key]] = action
            this._wrapedActions[store[key]] = toSyncAction(this, action)
            break
          case 'function':
            this._originalActions[key] = store[key]
            this._wrapedActions[key] = toSyncAction(this, store[key])
            break
          case 'object':
            this._originalActions[key] = store[key].action
            this._wrapedActions[key] = store[key].isAsync
              ? store[key].isCancelable
                ? toCancelableAsyncAction(
                    this,
                    store[key].action,
                    store[key].isAllowed
                  )
                : toAsyncAction(this, store[key].action, store[key].isAllowed)
              : toSyncAction(this, store[key].action, store[key].isAllowed)
            break
        }
      })
  }

  public startStep(proposal: TaggedProposal): void {
    // The proposal should be tagged with the current step ID
    // If not, that means that is an old payload and the presentation is not possible.

    if (proposal.stepId !== this.state.stepId) {
      console.info(
        '[RAVIOLI] Tried to present a proposal with a different step id.',
        proposal
      )
      return
    }
    // When running NAP, all the proposal emited from the NAPs are buffered.
    // We abort the step until all NAPs are ran.
    // Once NAPs are ran, we start the step with the composed proposal.
    if (this.isRunningNAP) {
      this.NAPproposalBuffer.push(proposal)
      return
    }

    /**
     * The proposal is presentable.
     * The instance is ready to start a new step
     * 1- presentation
     * 2- compute new control state
     * 3- determine new representation transform 
     * 4- assign new state  
     * 5- next action predicate or rendering
     */

    // Preserve immutable old model snapshot before transaction
    const snapshot = this.data.$snapshot

    const acceptedMutations = this.present(proposal)

    // Preserve previous control state for later
    const previousControlStates = this.state.controlStates

    /* 2 */
    const controlStates = getControlStates(
      {
        instanceControlStatePredicates: this.controlStatePredicates,
        factoryControlStatePredicates: this.factory.controlStatePredicates,
        model: this.data,
        previousControlStates: this.state.controlStates,
        acceptedMutations
      },
      {
        keepLastControlStateIfUndefined: this.options?.keepLastControlStateIfUndefined,
      }
    )

    /* 3 */
    const transformationPackage = getTransformationPackage({
      controlStates,
      previousControlStates: this.state.controlStates,
      instanceTransformations: this.transformations,
      factoryTransformations: this.factory.transformations,
      model: this.data,
      acceptedMutations
    })

    // This step led to a new representation transformation.
    const hasNewTransformation = this.currentTransformation?.id !== transformationPackage?.id

    // Initialize the new tranformation.
    if (hasNewTransformation) {
      // Default transformation, sync representation with model
      if (transformationPackage === undefined) {
        this.currentTransformation = undefined
        Object.defineProperty(this.state, 'representation', {value: clone(this.data)})
      }
      // Custom transformation
      else {
        this.currentTransformation = {
          id: transformationPackage.id,
          transformer: createTransformer(
            transformationPackage.computation,
            {
              contexts: {
                source: this.privateContext,
                output: this.publicContext
              }
            }
          )
        }
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this
        Object.defineProperty(self.state, 'representation', {
          get(): REPRESENTATION {
            return self.currentTransformation!.transformer(self.data)
          }
        })
      }
    }
    // Update the previous representation
    // Only handled case is sync copy of the model.
    // Other transformation are reactive and will update automatically
    // during reaction.
    else if (this.currentTransformation === undefined) {
      syncWithModel(this.stepMigration, this.state.representation as any)
    }

    /* 4 */
    this.state.controlStates = controlStates

    // Reset the NAP proposal buffer
    this.NAPproposalBuffer.clear()
    this.NAPproposalBuffer.stepId = this.state.stepId

    /* 5 */
    this.isRunningNAP = true
    
    // Defer render if there is some extra proposal to handle.
    if (!this.options?.debounceReaction ?? true) {
      this.render()
    }

    runNAPs({
      model: this.data,
      previousSnapshot: snapshot,
      controlStates: this.state.controlStates,
      previousControlStates,
      factoryStepReactions: this.factory.getNAP(),
      instanceStepReactions: this.NAPs,
      acceptedMutations,
      migration: this.stepMigration,
      proposal,
      actions: this._wrapedActions,
    })
    this.isRunningNAP = false

    if (this.NAPproposalBuffer.mutations.length) {
      this.startStep(this.NAPproposalBuffer.getTaggedProposal())
    }
    // No more NAP to handle. Render.
    if (this.options?.debounceReaction) {
      this.render()
    }
  }

  public present(proposal: TaggedProposal): MUTATION[] {
    return getContext(this.data).transaction(() => {
      // Accept or reject each mutation
      const _acceptedMutations = proposal.filter(({ type, payload }) => {
        // Acceptor name exists
        const hasAcceptor = this.hasAcceptorFactory(type)
        // Acceptor condition is valid
        const condition = this.getAcceptorFactory(type)?.(this.data)?.condition
        const isAcceptable = condition?.(payload) ?? true
        return hasAcceptor && isAcceptable
      })

      // Do the mutation
      _acceptedMutations.forEach(mutation =>
        this.getAcceptorFactory(mutation.type)?.(this.data)?.mutator(
          mutation.payload
        )
      )

      return _acceptedMutations
    })
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
  public addAcceptor(name: string, factory: AcceptorFactory<TYPE>): void {
    this.acceptorFactories.set(name, factory)
  }

  public removeAcceptor(acceptorName: string): void {
    this.acceptorFactories.delete(acceptorName)
  }

  public addActions(packages: PackagedActions<any, any>): void {
    this.packagedActions = {
      ...this.packagedActions,
      ...packages,
    }
    // Invalid the cached actions
    this.isStale = true
  }

  public removeAction(actionName: string): void {
    delete this.packagedActions[actionName]
    // Invalid the cached actions
    this.isStale = true
  }

  public hasAcceptorFactory(acceptorName: string): boolean {
    return (
      this.factory.hasAcceptorFactory(acceptorName) ||
      this.acceptorFactories.has(acceptorName)
    )
  }

  public hasControlState(name: string): boolean {
    return (
      this.factory.hasControlState(name) ||
      this.controlStatePredicates.has(name as CONTROL_STATES)
    )
  }
  
  public getAcceptorFactory(
    acceptorName: string
  ): AcceptorFactory<any> | undefined {
    return (
      this.acceptorFactories.get(acceptorName) ||
      this.factory.getAcceptorFactory(acceptorName)
    )
  }

  public hasNAP(NAPName: string): boolean {
    return this.NAPs.has(NAPName) || this.factory.hasNAP(NAPName)
  }

  public addStepReaction(
    NAPName: string,
    nap: Reaction<any, any, any, any>
  ): void {
    this.NAPs.set(NAPName, nap)
  }
  public removeNAP(NAPName: string): void {
    this.NAPs.delete(NAPName)
  }
  public compose(
    composer: (originalActions: ACTIONS) => Proposal<MUTATIONS>[]
  ): void {
    const taggedProposal: TaggedProposal = Object.assign(
      composer(this.originalActions).reduce(
        (mutations, proposal) => mutations.concat(proposal),
        []
      ),
      { stepId: this.state.stepId }
    )
    this.startStep(taggedProposal)
  }
  public addControlStatePredicate(
    id: string,
    predicate: PredicateFunction<TYPE, MUTATIONS, CONTROL_STATES>
  ): any {
    this.controlStatePredicates.set(
      id as CONTROL_STATES,
      predicate
    )
  }
  public removeControlStatePredicate(id: string): any {
    this.controlStatePredicates.delete(id as CONTROL_STATES)
  }

  public setTransformation<
    C extends Transformation<TYPE>
  >(
    id: string,
    transformation: C | {
      predicate?: RepresentationPredicate<TYPE, MUTATIONS, CONTROL_STATES>
      computation: C
    }
  ): any {
    const existingRepresentation = this.transformations.find(([_id]) => id === _id)
    if (existingRepresentation) {
      existingRepresentation[1] = transformation
    } else {
      this.transformations.push([id, transformation])
    }
    return this
  }

  public removeTransformation(id: string): any {
    this.transformations.splice(this.transformations.findIndex(([_id]) => _id === id), 1)
    return this
  }

  private render() {
    if (this.currentTransformation !== undefined) {
      this.publicContext.presentPatch(this.stepMigration.forward.map(operation => ({
        ...operation,
        path: toInstance(this.state.representation).$id + operation.path
      })))
    }
  }
}

function syncWithModel(migration: Migration, prevRepresentation: IInstance<any>): void {
  getContext(prevRepresentation).transaction(() => {
    migration.forward.forEach(o => {
      toNode(prevRepresentation).$applyOperation(o, true)
    })
  })
}

function toSyncAction<A extends (...args: any[]) => any>(
  component: IComponentInstance<any, any, any, any> & ISAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean,
) {
  return function(...args: Parameters<A>): void {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: component.state.controlStates })) {
        console.error('Unauthorized action')
        return
      }
    }
    const proposal: TaggedProposal = Object.assign(action(...args), {
      stepId: component.state.stepId,
    })
    component.startStep(proposal)
  }
}

/**
 * Used when an action call and its proposal presentation occurs at different steps.
 * Eg. Fetching some data
 */
function toAsyncAction<A extends (...args: any[]) => any>(
  component: IComponentInstance<any, any, any, any> & ISAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return async function(...args: Parameters<A>): Promise<void> {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: component.state.controlStates })) {
        console.error('Unauthorized action')
        return
      }
    }
    const proposal: TaggedProposal = Object.assign(await action(...args), {
      stepId: component.state.stepId,
    })
    // Check auth again
    // Maybe the app as reached a step where this action is
    // no more allowed

    if (authPredicate) {
      if (!authPredicate({ controlStates: component.state.controlStates })) {
        console.error('Unauthorized action')
        return
      }
    }
    component.startStep(proposal)
  }
}

/**
 * Used when more than a mix of sync and async action can occurs during a step. The one which first presents its proposal wins.
 * Eg.
 *   Actions.asyncSave()
 *   // Waiting for save... Ho no, a typo!
 *   Actions.syncCancel() <-- this one will present its proposal first, the proposal of asyncSave will be ignored.
 */
function toCancelableAsyncAction<A extends (...args: any[]) => any>(
  component: IComponentInstance<any, any, any, any> & ISAMLoop,
  action: A,
  authPredicate?: (actionContext: ActionContext) => boolean
) {
  return async function(...args: Parameters<A>): Promise<void> {
    // Check auth
    if (authPredicate) {
      if (!authPredicate({ controlStates: component.state.controlStates })) {
        console.error('Unauthorized action')
        return
      }
    }
    // Preserve the step id during which the action call occured.
    // It will be used to determinate, after the action resolving, if this proposal is still valid.
    const stepId = component.state.stepId

    const proposal: TaggedProposal = Object.assign(await action(...args), {
      stepId,
    })
    component.startStep(proposal)
  }
}

function getControlStates<T extends string>(
  {
    instanceControlStatePredicates,
    factoryControlStatePredicates,
    model,
    acceptedMutations,
    previousControlStates,
  }: {
    instanceControlStatePredicates: Map<T, CSPredicate<any, any, T>>
    factoryControlStatePredicates: Map<T, CSPredicate<any, any, T>>
    previousControlStates: T[]
    model: any
    acceptedMutations: any[]
  },
  options?: {
    keepLastControlStateIfUndefined?: boolean
  }
): T[] {
  const controlStates: T[] = []
  const ranCSP: T[] = [] // Store the ran Control State Predicate to filter the static/instance CSP

  instanceControlStatePredicates.forEach(runAndCache)
  factoryControlStatePredicates.forEach(runAndCache)

  if (!controlStates.length && options?.keepLastControlStateIfUndefined) {
    return previousControlStates
  }
  return controlStates

  /**
   * Evaluate the predicate.
   */
  function runPredicate(predicate: CSPredicate<any, any, T>): boolean {
    if (typeof predicate === 'function') {
      return predicate({
        model,
        acceptedMutations,
        previousControlStates /* , previousControlState: prevControlState */,
      })
    } else if (typeof predicate === 'string') {
      // Control state has already ran. Take its value from the buffer.
      if (ranCSP.includes(predicate)) {
        return controlStates.includes(predicate)
      }
      // Control state is not ran yet. Run it from the instance or the factory.
      else {
        const predicateName = predicate
        const predicateFunction =
          instanceControlStatePredicates.get(predicateName) ||
          instanceControlStatePredicates.get(predicateName)
        if (predicateFunction === undefined) {
          throw new Error('[RAVIOLI] Unknown control state predicate' + predicateName)
        } else {
          const result = runPredicate(predicateFunction)
          // Cache the result for this step
          ranCSP.push(predicateName)
          if (result) {
            controlStates.push(predicateName)
          }
          return result
        }
      }
    } else if (typeof predicate === 'object') {
      // This control state as an order constraint and can be called only if the specified control state was active previously
      if ('previous' in predicate) {
        return previousControlStates.includes(predicate.previous)
      } else if ('or' in predicate) {
        return predicate.or.some(runPredicate)
      } else if ('and' in predicate) {
        return predicate.and.every(runPredicate)
      } else if ('not' in predicate) {
        return !runPredicate(predicate.not)
      }
    }
    return true
  }

  function runAndCache(predicate: CSPredicate<any, any, T>, controlState: T): void {
    const result = runPredicate(predicate)
    if (typeof predicate === 'function') {
      ranCSP.push(controlState)
    }
    if (result) {
      controlStates.push(controlState)
    }
  }
}

function getTransformationPackage<T extends string>(
  {
    controlStates,
    instanceTransformations,
    factoryTransformations,
    model,
    acceptedMutations,
    previousControlStates,
  }: {
    controlStates: T[]
    instanceTransformations: [
      string,
      Transformation<any> | {
        predicate?: RepresentationPredicate<any, any, T>
        computation: Transformation<any>
      }
    ][]
    factoryTransformations: [
      string,
      Transformation<any> | {
        predicate?: RepresentationPredicate<any, any, T>
        computation: Transformation<any>
      }
    ][]
    previousControlStates: T[]
    model: any
    acceptedMutations: any[]
  }
): {
  id: string,
  computation: Transformation<any>
 } | undefined {
  let representationPackage: {
    id: string,
    computation: Transformation<any>
   } | undefined

  // Search in the array until it find a predicate which is valid
  // If no predicate is valid it will return the last global presentation (without predicate) it founds
  for (let i = 0; i < instanceTransformations.length; i++) {
    const rep = instanceTransformations[i][1]
    if (typeof rep === 'function') {
      representationPackage = {
        id: instanceTransformations[i][0],
        computation: rep
      }
    } else if (rep.predicate && runPredicate(rep.predicate)) {
      representationPackage = {
        id: instanceTransformations[i][0],
        computation: rep.computation
      }
    }
  }

  if (representationPackage !== undefined) {
    return representationPackage
  }

  // No valid representation computation found in the instance, let s take a look in the factory
  // Search in the array until it find a predicate which is valid
  // If no predicate is valid it will return the last global presentation (without predicate) it founds
  // Otherwise it will return undefined
  for (let i = 0; i < factoryTransformations.length; i++) {
    const rep = factoryTransformations[i][1]
    if (typeof rep === 'function') {
      representationPackage = {
        id: factoryTransformations[i][0],
        computation: rep
      }
    } else if (rep.predicate && runPredicate(rep.predicate)) {
      representationPackage = {
        id: factoryTransformations[i][0],
        computation: rep.computation
      }
    }
  }

  return representationPackage

  /**
   * Evaluate the predicate.
   */
  function runPredicate(predicate: RepresentationPredicate<any, any, T>): boolean {
    if (typeof predicate === 'function') {
      return predicate({
        model,
        acceptedMutations,
        previousControlStates /* , previousControlState: prevControlState */,
      })
    } else if (typeof predicate === 'string') {
      const neededControlState = predicate
      // True if this control state is active
      if (controlStates.includes(neededControlState)) {
        return true
      }
    } else if (typeof predicate === 'object') {
      // This control state as an order constraint and can be called only if the specified control state was active previously
      if ('or' in predicate) {
        return predicate.or.some(runPredicate)
      } else if ('and' in predicate) {
        return predicate.and.every(runPredicate)
      } else if ('not' in predicate) {
        return !runPredicate(predicate.not)
      }
    }
    return false
  }
}

function runNAPs({
  factoryStepReactions,
  instanceStepReactions,
  model,
  previousSnapshot,
  proposal,
  migration,
  acceptedMutations,
  controlStates,
  previousControlStates,
  actions,
}: Delta<any, any, any> & {
  model: any,
  actions: Actions<any, any, any>
  factoryStepReactions: Map<string, Reaction<any, any, any, any>>
  instanceStepReactions: Map<string, Reaction<any, any, any, any>>
  proposal
}): void {
  const args = {
    model,
    delta: {
      previousSnapshot,
      acceptedMutations,
      proposal,
      controlStates,
      previousControlStates,
      migration,
    }
  }
  const ranStepReaction: string[] = [] // Store the ran NAPs to filter the static/instance NAP
  // Run the instance NAP
  instanceStepReactions.forEach((reaction, key) => {
    if (!reaction.predicate || reaction.predicate(args)) {
      reaction.effect(args, actions)
      // Mark NAP as ran
      ranStepReaction.push(key)
    }
  })
  // Run the static NAP
  factoryStepReactions.forEach((reaction, key) => {
    // Filter nap which have already ran on the instance
    if (!ranStepReaction.includes(key)) {
      if (!reaction.predicate || reaction.predicate(args)) {
        reaction.effect(args, actions)
      }
    }
  })
}
