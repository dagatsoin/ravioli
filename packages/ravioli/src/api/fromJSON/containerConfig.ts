/**
 * Configuration interface for creating containers from JSON.
 * Each field maps component names to their registry keys.
 *
 * @example
 * ```typescript
 * const config: ContainerConfig = {
 *   acceptors: {
 *     setHP: 'setHP_acceptor',
 *     addItem: 'addItem_acceptor'
 *   },
 *   controlStatePredicates: {
 *     IS_ALIVE: 'isAlive_predicate',
 *     IS_DEAD: 'isDead_predicate'
 *   },
 *   actions: {
 *     heal: 'heal_action',
 *     damage: 'setHP'  // Can reference acceptor for shortcut
 *   },
 *   stepReactions: [
 *     'autoHeal_reaction',
 *     'logChanges_reaction'
 *   ]
 * };
 * ```
 */
export interface ContainerConfig {
  /**
   * Maps mutation names to registered acceptor keys.
   * The key is the mutation name used in proposals, the value is the registry key.
   */
  acceptors?: Record<string, string>;

  /**
   * Maps control state names to registered predicate keys.
   * The key is the control state name, the value is the registry key.
   */
  controlStatePredicates?: Record<string, string>;

  /**
   * Maps action names to registered action keys.
   * The key is the action name exposed in the container, the value is the registry key.
   */
  actions?: Record<string, string>;

  /**
   * Array of registered step reaction keys.
   * Step reactions are added in the order they appear in this array.
   */
  stepReactions?: string[];
}
