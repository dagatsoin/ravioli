import { INodeInstance } from './INodeInstance'
import { getRoot } from '../helpers'
/**
 * Model changed. Spread the new around the world!
 */
export function computeNextState(model: INodeInstance<any>): void {
  // Update all observers of this model
  model.$$container.addUpdatedObservable(getRoot(model))
}
