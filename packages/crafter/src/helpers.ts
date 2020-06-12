import { IType } from './lib/IType'
import { IInstance } from './lib/IInstance'
import { isInstance } from './lib/Instance'
import { isNode } from "./lib/isNode"
import { FactoryOutput } from './lib/IFactory'
import { IObservable } from './IObservable'
import { IContainer } from './IContainer'
import { InstanceFromValue } from './InstanceFromValue'
import { ILeafInstance } from './lib/ILeafInstance'
import { INodeInstance } from './lib/INodeInstance'
import { Command } from './lib/JSONPatch'

export function toNode<T>(data: T): InstanceFromValue<T> {
  if (!isNode<T>(data)) {
    throw new Error(
      `Invalid argument. Expecting a INode<T>. Got ${typeof data}`
    )
  }
  return data
}

export function toLeaf<T>(data: T & any): ILeafInstance<T> {
  if (!data.$isLeaf) {
    throw new Error(
      `Invalid argument. Expecting a ILeafInstance<T>. Got ${typeof data}`
    )
  }
  return data
}

export function noop(): void {}

/* export function extendObservable<O extends {}>(value: O, ...args: any[]) {
  if (isObservable(value)) {
    throw new Error('not implemented')
  } else {
    const context = args[args.length-1] instanceof CrafterContainer
      ? args[args.length-1]
      : undefined
    const sources = context
      ? args.slice(args.length-1)
      : args
      

    const target = Object.assign(value, ...sources)  
    const obserbableVersion = observable(target, {isStrict: true, context})

    Object.keys(target).forEach(function(key) {
      Object.defineProperty(target, key, {
        get(){
          return obserbableVersion[key]
        },
        set(v){
          obserbableVersion[key] = v
        }
      })
    })

  }
}
 */
export function toInstance<T>(data: any): IInstance<T> {
  if (!isInstance<T>(data)) {
    throw new Error(
      `Invalid argument. Expecting a IInstance<T>. Got ${typeof data}`
    )
  }
  return data
}

/**
 * Return the right value.
 * If it is an node return the instance
 * If it is a primitive leaf return the value
 * If it is a reference return the referenced instance or value
 */
export function unbox<T>(instance: IInstance<T> | IInstance<T, string>): T {
  return isNode<T>(instance)
    ? ((instance as unknown) as T)
    : instance.$value
}

export function getSnapshot<T extends IType<any>>(
  instance: FactoryOutput<T>
): T['Snapshot'] {
/*   if (__DEV__ && getContext(toInstance(instance)).isTransaction) {
    console.warn("Retrieving a snapshot during a transaction won't reflect the current change until the transaction is finished.")
  }
 */  return toInstance(instance).$snapshot
}

export function clone<T>(instance: T, options?: {id?: string, context?: IContainer}): T {
  const node = toNode(instance)
  const snapshot = getSnapshot(node)
  if (isInstance(instance) && node.$type.isValidSnapshot(snapshot)) {
    return node.$type.create(snapshot as any, { id: options?.id, context: options?.context || instance.$$container }) as T
  }
  throw new Error('Trying to clone other than an IInstance')
}

export function assert(assertion: boolean, errorMsg?: string): void {
  if (!assertion) {
    throw new Error(errorMsg)
  }
}

// Filters
export function unique(value: any, index: number, self: any[]): boolean { 
  return self.indexOf(value) === index;
}

/**
 * Return the key of the node children within a path.
 * eg: for a node with the path "/player/stats" and a path "/player/stats/base/health", it will return "base"
 * @param nodePath
 * @param path 
 */
export function getTargetKey(_path: string): string {
  return _path.split('/').filter(s => !!s.length).pop() || '/'
}

/**
 * Return the key of the node children within a path.
 * eg: for a node with the path "/player/stats" and a path "/player/stats/base/health", it will return "base"
 * @param nodePath
 * @param path 
 */
export function getChildKey<T>(nodePath: string, _path: string): keyof T | undefined{
  const nodePathDepth = nodePath.split('/').filter(s => !!s.length).length
  return _path.split('/').filter(s => !!s.length)[nodePathDepth] as keyof T
}

/**
 * Return a string by assembling the different parts.
 * Help to prevent double // issue when dealing with node paths.
 * @param segments
 */
export function makePath(...segments: string[]): string {
  return segments.reduce(function(p, s) {
    // It is the root path
    if (s === '/') {
      return p
    }
    // Remove / at start and end
    const safeSegment = s.replace(/^(\/*)(.*)\b(\/*)$/g, "$2")
    return safeSegment
      ? p + '/' + safeSegment
      : p
  }, '')
}

export function sync<T extends IObservable>(observable: T): T {
  const target = clone(observable)
  toNode(observable).$$container.addMigrationListener(m => m.forward.forEach(c => toNode(target).$present(c, true)))
  return target
}

/**
 * Return true if the path target a key of a node.
 */
export function isOwnLeafPath(nodePath: string, _path: string): boolean {
  return getChildKey(nodePath, _path) === getTargetKey(_path)
}

/**
 * Return true if it is the node path
 */
export function isNodePath(nodePath: string, path: string): boolean {
  return nodePath === path
}

/**
 * Return true id the path target a grand child
 */
export function isGrandChildPath(commandPath: string, nodePath: string) {
  return !isOwnLeafPath(nodePath, commandPath) && !isNodePath(nodePath, commandPath)
}

export function isChildPath(nodePath: string, _path: string): boolean {
  return nodePath.indexOf(_path) === 0 && nodePath.length !== _path.length
}

export function getRoot<I extends IInstance<any>>(node: I): I extends INodeInstance<any> ? INodeInstance<any> :ILeafInstance<any> {
  return node.$parent ? getRoot(toNode(node.$parent)) : node as any
}

export function isRoot(node: IInstance<any>): boolean {
  return node.$parent === undefined
}

export function getContext(instance: IInstance<any>): IContainer {
  if (instance.$$container) {
    return instance.$$container
  } else {
   throw new Error(`No context found on object ${instance}`) 
  }
}

export function isUnique<T>(value: T, index: number, array: T[]) {
  return array.indexOf(value) === index;
}

export function fail(e: string) {
  if (__DEV__) {
    throw new Error(e)
  }
}

export function warn(...msg: string[]) {
  if (__DEV__) {
    console.warn(...msg)
  }
}

/**
 * Reduce a patch by removing redondant command.
 *  {op: "push", path: "/player/inventory", value: {id: "48646"}},
 *  {op: "replace", path: "/pets", value: [{id: "74455"}]},
 *  {op: "replace", path:"/player/name", value: "Fraktos"},
 *  {op: "replace", path:"/player/stats/health", value: 5},
 *  {op: "replace", path:"/player/stats", value: { health: 5 }},
 *  {op: "replace", path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
 * becomes
 *  {op: "push", path: "/player/inventory", value: {id: "48646"}},
 *  {op: "replace", path: "/pets", value: [{id: "74455"}]},
 *  {op: "replace", path:"/player", value: {name: "Fraktos", stats: { health: 5 }}},
 * @param patch 
 */
export function reduceSnapshot(patch: Command[]) {
  if (!patch.length) {
    return []
  }
  if (patch.length === 1) {
    return patch
  }
  // Split patch in operation group
  const operationGroups = patch.reduce(
    (groups, command, index) => {
      // The first group is already initialized in the last arg of the reduce call.
      if (index === 0) {
        return groups
      }
      const currentGroup =  groups[groups.length-1]
      if (currentGroup.find(({op}) => op === command.op)) {
        currentGroup.push(command)
      } else {
        groups.push([command])
      }
      return groups
    },
    [[patch[0]]] as Command[][]
  )
  
  // Reduce each "replace" command groups by their minimal operation
  return operationGroups.flatMap(function(group) {
    if (group[0].op === "replace") {
      // find common roots
      return findMostLittleCommand(group)
    } else {
      return group
    }
  })
}

function findMostLittleCommand(group: Command[]) {
  // Sort paths by ascending length
  const paths = group
    .map(({ path }) => path)
    .sort((a, b) => a.length - b.length)

  const groups = [paths[0]]
  let currentSegment = paths[0]
  
  // Split paths in common group by root
  for (let i = 1; i < paths.length; i++) {
    const path = paths[i]
    if (!path.startsWith(currentSegment)) {
      groups.push(path)
      currentSegment = path
    }
  }
  // Return the most little command
  return groups.map(commonRoot => group.find(({ path }) => path === commonRoot))
}
