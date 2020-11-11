import { CrafterContainer } from './container'
import { getGlobal } from './utils/utils'

/**
 * Create a default global container.
 * Each component (observable, derivation, reaction)
 * will be attached to this container by default.
 * Also this will make sure to have only one instance
 * of Crafter running on the node process.
 */

const g = getGlobal()

if (!g.$$crafterContext) {
    g.$$crafterContext = new CrafterContainer()
}

//export * from './array'
export * from './container'
export * from './enum'
//export * from './identifier'
export * from './IContainer'
export * from './IObservable'
export * from './helpers'
export * from './lib'
export * from './literal'
//export * from './map'
export * from './object'
export * from './observer'
//export * from './optional'
export * from './Primitive'
//export * from './union'
export * from './container'
export * from './utils/utils'