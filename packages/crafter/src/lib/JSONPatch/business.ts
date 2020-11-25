import { Command, Operation } from "./type"
import { IObserver } from "../../observer/IObserver"
import { getLastPart, getParentPath, makePath } from '../../helpers'

export function isBasicCommand<C extends Command>(proposal: C): boolean {
  return (
    proposal.op === Operation.add ||
    proposal.op === Operation.copy ||
    proposal.op === Operation.move ||
    proposal.op === Operation.replace ||
    proposal.op === Operation.remove
  )
}

function isExpendSizeOperation(command: Command): boolean {
  return (
    // Basic
    command.op === Operation.add ||
    // Array
    command.op === Operation.push ||
    command.op === Operation.unshift ||
    command.op === Operation.splice && ((command.deleteCount ?? 0) < (command.value?.length ?? 0))
  )
}

function isShrinkSizeOperation(command: Command): boolean {
  return (
    // Basic
    command.op === Operation.remove ||
    // Array
    command.op === Operation.splice && ((command.deleteCount ?? 0) > (command.value?.length ?? 0)) ||
    command.op === Operation.shift ||
    command.op === Operation.pop ||
    // Map
    command.op === Operation.clear
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
 *    - OR [
 *      - one of the command value leaf matches the path of an updated observable
 *      - the command path is a dependency or the observer (case of a node replacement)
 *    ]
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
 *    - it is an atomic shape update command with explicit target path: add, remove, set, delete
 *    - OR [
 *       - AND [
 *        - one of the updated observables path matches the children array affected by the operation
 *        - the matched updated observables path matches one of the path of the observer dependencies 
 *       ]
 *       - AND [
 *        - one of the updated observable is the length of the array
 *        - some of the observer dependencies is the length of the array
 *       ] 
 *    ]
 *  ]
 *  5. AND [
 *    - it targets a leaf 
 *    - an updated observable path matches one of the path of the observer dependencies
 *  ]
 * 
 * @param observer 
 * @param param1 
 */
// export function isDependent(observer: IObserver, {path, op, value}: Command & {value?: any}, updatedObservablePaths: string[]) {
//   return (
//     /* 1 */
//     (
//       (typeof value === 'object' || value instanceof Map) &&
//       isNodeUpdateOperation(op) &&    
//       hasPath(observer, [
//         ...getObjectPaths(value).map(p => makePath(path, p)),
//         path
//       ])
//     ) ||
//     /* 2 */
//     (
//       (typeof value !== 'object' && !(value instanceof Map)) &&
//       isLeafUpdateOperation(op) &&
//       hasPath(observer, updatedObservablePaths)
//     ) ||
//     /* 3 */
//     (
//       (Array.isArray(value) || value instanceof Map) &&
//       isShapeMutationOperation({path, op, value} as Command) &&
//       hasPath(observer, updatedObservablePaths)
//     )
//   )
// }

export function isDependent(observer: IObserver, {path, op, value}: Command & {value?: any}, updatedObservablePaths: string[]) {
  switch (op) {
    case Operation.add:
      // Add is only applied on node
      // Return true if the observer observes the node
      return observer.dependencies.includes(getParentPath(path))
  }
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
 * Return true if the operation has an incidence on the lenght/size
 *  of an array/map or the nb of an object fields.
 */
export function isShapeMutationOperation(command: Command): boolean {
  return isShrinkSizeOperation(command) || isExpendSizeOperation(command)
}