import { IContainerFactory } from "..";
import { createContainer } from "..";
import { PackagedActions } from "../../lib/api/action";
import { ContainerConfig } from "./containerConfig";
import {
  getAcceptor,
  getAction,
  getControlStatePredicate,
  getStepReaction,
} from "./registry";

/**
 * Creates a container factory from a JSON configuration.
 * Components (acceptors, actions, predicates, reactions) must be pre-registered
 * in the global registry before calling this function.
 *
 * @param config - The container configuration object
 * @returns A container factory that can be used to create instances
 * @throws Error if any referenced registry keys are not found
 *
 * @example
 * ```typescript
 * // 1. Register components
 * registerAcceptor('setHP', {
 *   mutator: (data, { hp }: { hp: number }) => {
 *     data.hp = hp;
 *   }
 * });
 *
 * registerControlStatePredicate('isAlive', ({ data }) => data.hp > 0);
 *
 * registerAction('heal', () => [{ type: 'setHP', payload: { hp: 100 } }]);
 *
 * // 2. Create container from config
 * const config = {
 *   acceptors: { setHP: 'setHP' },
 *   controlStatePredicates: { IS_ALIVE: 'isAlive' },
 *   actions: { heal: 'heal' }
 * };
 *
 * const playerFactory = createContainerFromJSON<{ hp: number }>(config);
 *
 * // 3. Create instances
 * const player = playerFactory.create({ hp: 100 });
 * ```
 */
export function createContainerFromJSON<T>(
  config: ContainerConfig
): IContainerFactory<T> {
  let container: any = createContainer<T>();

  // 1. Add acceptors
  if (config.acceptors) {
    for (const [mutationName, registryKey] of Object.entries(config.acceptors)) {
      const acceptor = getAcceptor(registryKey);
      container = container.addAcceptor(mutationName, acceptor);
    }
  }

  // 2. Add control state predicates
  if (config.controlStatePredicates) {
    for (const [stateName, registryKey] of Object.entries(config.controlStatePredicates)) {
      const predicate = getControlStatePredicate(registryKey);
      container = container.addControlStatePredicate(stateName, predicate);
    }
  }

  // 3. Add actions
  if (config.actions) {
    const actions: PackagedActions<any, any> = {};
    for (const [actionName, registryKey] of Object.entries(config.actions)) {
      actions[actionName] = getAction(registryKey);
    }
    container = container.addActions(actions);
  }

  // 4. Add step reactions
  if (config.stepReactions) {
    for (const registryKey of config.stepReactions) {
      const reaction = getStepReaction(registryKey);
      container = container.addStepReaction(reaction);
    }
  }

  return container as IContainerFactory<T>;
}
