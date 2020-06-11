import { Command, Operation } from "./type"
import { IObserver } from "../../observer/IObserver"

export function isBasicCommand<C extends Command>(proposal: C): boolean {
  return (
    proposal.op === Operation.add ||
    proposal.op === Operation.copy ||
    proposal.op === Operation.move ||
    proposal.op === Operation.replace ||
    proposal.op === Operation.remove
  )
}

function isExpendSizeCommand(op: Operation): boolean {
  return (
    // Basic
    op === Operation.add ||
    // Array
    op === Operation.push ||
    op === Operation.unshift ||
    op === Operation.splice ||
    op === Operation.setLength
  )
}

function isShrinkSizeCommand(op: Operation): boolean {
  return (
    // Basic
    op === Operation.remove ||
    // Array
    op === Operation.splice ||
    op === Operation.shift ||
    op === Operation.pop ||
    op === Operation.setLength ||
    // Map
    op === Operation.delete ||
    op === Operation.clear
  )
}

function isLeafUpdateOperation(op: Operation) {
  return (
    op === Operation.replace ||
    op === Operation.move ||
    op === Operation.copy
  )
}

function isNodeUpdateOperation(op: Operation) {
  return (
    // Basic
    op === Operation.replace ||
    op === Operation.move ||
    op === Operation.copy ||

    // Array
    op === Operation.copyWithin ||
    op === Operation.fill ||
    op === Operation.reverse ||
    op === Operation.sort
  )
}

function mapToObject(map: Map<string, any>) {
  return Array.from(map.entries()).reduce(
    function(obj, [key, value]) {
      obj[key] = value
      return obj
    },
    {}
  )
}

/**
 * Deeply transform an object into a list of path to its leafs.
 * Support also Map and Array.
 * @param object 
 * @param root 
 */
function getObjectPaths(object: {}, root: string = '/'): string[] {
  const keys = Object.keys(object)
  return keys.flatMap(function(key) {
    switch(typeof object[key]) {
      case 'object':
        if (object[key] instanceof Map) {
          return getObjectPaths(mapToObject(object[key]), root + key + '/')
        }
        return getObjectPaths(object[key], root + key + '/')

      default: return root + key
    }
  })
}

/**
 * This predicate is the core of the reaction system. It analyses the changes
 * happened during transaction and see if the given observer is dependent.
 * 
 * OR[
 *  1. AND [
 *    - it is an node update command: replace, copy or move, reverse, fill...
 *    - it targets an object, array or map node
 *    - one of the command value leaf matches the path of an updated observable
 *    - some of the matched updated observables match one of the path of the observer dependencies 
 *  ]
 *  2. AND [
 *    - it is an array wide update command: reverse, fill, sort
 *    - some of the updated observable path match the array children
 *    - some of the matched updated observables match one of the path of the observer dependencies 
 *  ]
 *  3. AND [
 *    - it is an array atomic shape update command without explicit target path: splice, unshift, shift, pop, push
 *    - OR [
 *       - AND [
*         - some of the matched updated observables paths match one of the path of the array children affected by the operation 
 *        - some of the matched updated observables paths match one of the path of the observer dependencies 
 *       ]
 *       - AND [
 *        - one of the updated observable is the lenght of the array
 *        - some of the observer dependencies is the length of the array
 *       ] 
 *    ]
 *  ]
 *  4. AND [
 *    - it targets a map, array or object node
 *    - it is a atomic shape update command with explicit target path: add, remove, set, delete
 *    - OR [
 *       - AND [
 *        - one of the update observable path matches the array child affected by the operation
 *        - the matched updated observable path matches one of the path of the observer dependencies 
 *       ]
 *       - AND [
 *        - one of the updated observable is the lenght of the array
 *        - some of the observer dependencies is the length of the array
 *       ] 
 *    ] *  ]
 *  5. AND [
 *    - it targets a leaf 
 *    - an updated observable path matches one of the path of the observer dependencies
 *  ]
 * 
 * @param observer 
 * @param param1 
 */
export function isDependent(observer: IObserver, {op, value}: Command, updatedObservablePaths: string[]) {
  return (
    /* 1 */
    (
      (typeof value === 'object' || value instanceof Map) &&
      isNodeUpdateOperation(op) &&    
      hasPath(observer, getObjectPaths(value))
    ) ||
    /* 2 */
    (
      (typeof value !== 'object' && !(value instanceof Map)) &&
      isLeafUpdateOperation(op) &&
      hasPath(observer, updatedObservablePaths)
    ) ||
    /* 3 */
    (
      (Array.isArray(value) || value instanceof Map) &&
      isShapeMutationCommand(op) &&
      hasPath(observer, updatedObservablePaths)
    )
  )
}

/**
 * Return true if some of the given paths is a dependence of the node.
 * @param node
 * @param path 
 */
export function hasPath(node: IObserver, paths: string[]): boolean {
  return node.dependencies.some(path => paths.includes(path))
}

/**
 * Return true if the operation has an incidence on the lenght/size of the array/map
 */
export function isShapeMutationCommand(op: Operation): boolean {
  return isShrinkSizeCommand(op) || isExpendSizeCommand(op)
}