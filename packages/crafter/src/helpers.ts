import { IType } from './lib/IType'
import { IInstance } from './lib/IInstance'
import { INodeInstance } from './lib/INodeInstance'
import { isInstance } from './lib/Instance'
import { isNode } from "./lib/isNode"
import { FactoryOutput } from './lib/IFactory'
import { IObservable } from './IObservable'
import { IContainer } from './IContainer'
import { InstanceFromValue } from './InstanceFromValue'

export function toNode<T>(data: any): InstanceFromValue<T> {
  if (!isNode<T>(data)) {
    throw new Error(
      `Invalid argument. Expecting a INode<T>. Got ${typeof data}`
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
export function unbox<T>(instance: IInstance<T> | string, context: IContainer): T {
  return isNode<T>(instance)
    ? ((instance as unknown) as T)
    : typeof instance === 'string'
    ? ((context.getReferenceTarget(instance) as unknown) as T)
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
    return node.$type.create(snapshot, { id: options?.id, context: options?.context || instance.$$container }) as T
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
export function getChildKey(nodePath: string, _path: string): string | undefined{
  const nodePathDepth = nodePath.split('/').filter(s => !!s.length).length
  return _path.split('/').filter(s => !!s.length)[nodePathDepth]
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

export function sync<T extends IObservable<any>>(observable: T): T {
  const target = clone(observable)
  toNode(observable).$addOperationListener(o => toNode(target).$applyOperation(o, true))
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
export function isNodePath(nodePath: string, _path: string): boolean {
  return nodePath === _path
}

export function isChildPath(nodePath: string, _path: string): boolean {
  return nodePath.indexOf(_path) === 0 && nodePath.length !== _path.length
}

export function getRoot(node: INodeInstance<any>): INodeInstance<any> {
  return node.$parent ? getRoot(node.$parent) : node
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