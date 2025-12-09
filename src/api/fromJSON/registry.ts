import { Acceptor } from "../../lib/api/acceptor";
import { ActionPackage } from "../../lib/api/action";
import { CSPredicate } from "../../lib/api/predicate";
import { StepReaction } from "../../lib/api/stepReaction";

/**
 * Global registry for storing reusable container components.
 * Components can be registered once and referenced by name in JSON configurations.
 */
interface ComponentRegistry {
  acceptors: Map<string, Acceptor<any, any>>;
  controlStatePredicates: Map<string, CSPredicate<any, any, any>>;
  actions: Map<string, ActionPackage<any, any>>;
  stepReactions: Map<string, StepReaction<any, any, any, any, any>>;
}

const registry: ComponentRegistry = {
  acceptors: new Map(),
  controlStatePredicates: new Map(),
  actions: new Map(),
  stepReactions: new Map(),
};

/**
 * Register an acceptor in the global registry.
 *
 * @param name - Unique identifier for the acceptor
 * @param acceptor - The acceptor to register
 * @throws Error if an acceptor with the same name is already registered
 *
 * @example
 * ```typescript
 * registerAcceptor('setHP', {
 *   mutator: (data, { hp }: { hp: number }) => {
 *     data.hp = hp;
 *   }
 * });
 * ```
 */
export function registerAcceptor(name: string, acceptor: Acceptor<any, any>): void {
  if (registry.acceptors.has(name)) {
    throw new Error(`Acceptor '${name}' is already registered. Use a different name or clear the registry first.`);
  }
  registry.acceptors.set(name, acceptor);
}

/**
 * Register a control state predicate in the global registry.
 *
 * @param name - Unique identifier for the predicate
 * @param predicate - The control state predicate function to register
 * @throws Error if a predicate with the same name is already registered
 *
 * @example
 * ```typescript
 * registerControlStatePredicate('isAlive', ({ data }) => data.hp > 0);
 * ```
 */
export function registerControlStatePredicate(
  name: string,
  predicate: CSPredicate<any, any, any>
): void {
  if (registry.controlStatePredicates.has(name)) {
    throw new Error(`Control state predicate '${name}' is already registered. Use a different name or clear the registry first.`);
  }
  registry.controlStatePredicates.set(name, predicate);
}

/**
 * Register an action in the global registry.
 *
 * @param name - Unique identifier for the action
 * @param action - The action package to register (can be a function, string shortcut, or configurable action)
 * @throws Error if an action with the same name is already registered
 *
 * @example
 * ```typescript
 * registerAction('heal', () => [{ type: 'setHP', payload: { hp: 100 } }]);
 * ```
 */
export function registerAction(name: string, action: ActionPackage<any, any>): void {
  if (registry.actions.has(name)) {
    throw new Error(`Action '${name}' is already registered. Use a different name or clear the registry first.`);
  }
  registry.actions.set(name, action);
}

/**
 * Register a step reaction in the global registry.
 *
 * @param name - Unique identifier for the step reaction
 * @param reaction - The step reaction configuration to register
 * @throws Error if a step reaction with the same name is already registered
 *
 * @example
 * ```typescript
 * registerStepReaction('autoHeal', {
 *   debugName: 'autoHeal',
 *   when: ({ delta }) => delta.acceptedMutations.some(m => m.type === 'setHP'),
 *   do: ({ actions }) => actions.heal()
 * });
 * ```
 */
export function registerStepReaction(
  name: string,
  reaction: StepReaction<any, any, any, any, any>
): void {
  if (registry.stepReactions.has(name)) {
    throw new Error(`Step reaction '${name}' is already registered. Use a different name or clear the registry first.`);
  }
  registry.stepReactions.set(name, reaction);
}

/**
 * Retrieve a registered acceptor by name.
 *
 * @param name - The name of the registered acceptor
 * @returns The registered acceptor
 * @throws Error if the acceptor is not found in the registry
 */
export function getAcceptor(name: string): Acceptor<any, any> {
  const acceptor = registry.acceptors.get(name);
  if (!acceptor) {
    throw new Error(`Acceptor '${name}' not found in registry. Did you forget to register it?`);
  }
  return acceptor;
}

/**
 * Retrieve a registered control state predicate by name.
 *
 * @param name - The name of the registered predicate
 * @returns The registered control state predicate
 * @throws Error if the predicate is not found in the registry
 */
export function getControlStatePredicate(name: string): CSPredicate<any, any, any> {
  const predicate = registry.controlStatePredicates.get(name);
  if (!predicate) {
    throw new Error(`Control state predicate '${name}' not found in registry. Did you forget to register it?`);
  }
  return predicate;
}

/**
 * Retrieve a registered action by name.
 *
 * @param name - The name of the registered action
 * @returns The registered action package
 * @throws Error if the action is not found in the registry
 */
export function getAction(name: string): ActionPackage<any, any> {
  const action = registry.actions.get(name);
  if (!action) {
    throw new Error(`Action '${name}' not found in registry. Did you forget to register it?`);
  }
  return action;
}

/**
 * Retrieve a registered step reaction by name.
 *
 * @param name - The name of the registered step reaction
 * @returns The registered step reaction
 * @throws Error if the step reaction is not found in the registry
 */
export function getStepReaction(name: string): StepReaction<any, any, any, any, any> {
  const reaction = registry.stepReactions.get(name);
  if (!reaction) {
    throw new Error(`Step reaction '${name}' not found in registry. Did you forget to register it?`);
  }
  return reaction;
}

/**
 * Clear all registered components from the registry.
 * This is primarily useful for testing to ensure a clean state between tests.
 *
 * @example
 * ```typescript
 * // In a test teardown
 * afterEach(() => {
 *   clearRegistry();
 * });
 * ```
 */
export function clearRegistry(): void {
  registry.acceptors.clear();
  registry.controlStatePredicates.clear();
  registry.actions.clear();
  registry.stepReactions.clear();
}
