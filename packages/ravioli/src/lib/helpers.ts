import {
  IComponentInstance,
  AcceptorFactory,
  TaggedProposal,
  IComponentFactory,
  IEnhancabble,
  PackagedActions,
  PredicateFunction,
  ISAMLoop,
  Reaction,
  IActionCacheReset,
  Transformation,
  RepresentationPredicate as TransformPredicate,
  RepresentationPredicate,
} from '../api'

export function addHiddenMethod(instance: any, key: string, method: Function): void {
  Object.defineProperty(instance, key, {
    configurable: false,
    writable: false,
    enumerable: false,
    value: method,
  })
}

declare const process: any

export const check =
  process.env.NODE_ENV !== 'production'
    ? (predicate: () => boolean, errMessage: string): void => {
        if (!predicate()) {
          throw new Error(errMessage)
        }
      }
    : (): void => {}

export function addAcceptor<T>(
  instance: IComponentInstance<T, any, any, any>,
  acceptorName: string,
  acceptor: AcceptorFactory<T>
): void {
  ;((instance as unknown) as IEnhancabble).addAcceptor(acceptorName, acceptor)
}

export function removeAcceptor(
  instance: IComponentInstance<any, any, any, any>,
  acceptorName: string
): void {
  ;((instance as unknown) as IEnhancabble).removeAcceptor(acceptorName)
}

export function getAcceptorFactory(
  instance: IComponentInstance<any, any, any, any>,
  acceptorName: string
): AcceptorFactory<any> | undefined {
  return (instance as any).getAcceptorFactory(acceptorName)
}

export function present(
  instance: IComponentInstance<any, any, any, any>,
  proposal: TaggedProposal
): void {
  ((instance as unknown) as ISAMLoop).startStep(proposal)
}

export function addActions<
  C extends IComponentFactory<any, any, any, any, any, any, any>
>(
  instance: IComponentInstance<any, any, any, any>,
  actions: PackagedActions<any, C['mutations']>
): void {
  ((instance as unknown) as IEnhancabble).addActions(actions)
}

export function removeAction(
  instance: IComponentInstance<any, any, any, any>,
  actionName: string
): void {
  ((instance as unknown) as IEnhancabble).removeAction(actionName)
}

export function addStepReaction(
  instance: IComponentInstance<any, any, any, any>,
  NAPName: string,
  nap: Reaction<any, any, any, any>
): void {
  ((instance as unknown) as IEnhancabble).addStepReaction(NAPName, nap)
}

export function removeNAP(
  instance: IComponentInstance<any, any, any, any>,
  NAPName: string
): void {
  ((instance as unknown) as IEnhancabble).removeNAP(NAPName)
}

export function addControlStatePredicate<
  T extends IComponentFactory<any, any, any, any, any, any, any>
>(
  instance: IComponentInstance<any, any, any, any>,
  id: string,
  predicate: PredicateFunction<T['type']['Type'], T['mutations']>
): void {
  ((instance as unknown) as IEnhancabble).addControlStatePredicate(
    id,
    predicate
  )
}

export function removeControlStatePredicate(
  instance: IComponentInstance<any, any, any, any>,
  id: string
): void {
  ((instance as unknown) as IEnhancabble).removeControlStatePredicate(id)
}

export function rebuildActionsCache(instance: any): void {
  (instance as IActionCacheReset).rebuildActionsCache()
}

export function setTransformation<T>(
  instance: IComponentInstance<T, any, any, any>,
  id: string,
  transformation: Transformation<T> | {
    predicate?: RepresentationPredicate<T, any, any>
    computation: Transformation<T>
  }
): void {
  ((instance as unknown) as IEnhancabble).setTransformation(
    id,
    transformation
  )
}

export function removeTransformation(
  instance: IComponentInstance<any, any, any, any>,
  id: string
): void {
  ((instance as unknown) as IEnhancabble).removeTransformation(id)
}