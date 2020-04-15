import { getChildKey, getSnapshot, toInstance } from '../../helpers'
import {
  CopyChanges,
  INodeInstance,
  MoveChanges,
  RemoveChanges,
  ReplaceChanges,
} from '../INodeInstance'
import {
  AddOperation,
  CopyOperation,
  MoveOperation,
  RemoveOperation,
  ReplaceOperation,
} from '../JSONPatch'

export function addReplacePatch<T>(
  model: INodeInstance<unknown>,
  proposal: ReplaceOperation<T>,
  changes: ReplaceChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'replace',
        path: proposal.path,
        value: changes.replaced,
      },
    ],
  })
}

/**
 * Add a child to a model at a given key/index
 *
 */
export function add(model: INodeInstance<unknown>, value: any, index: string): void {
  const instance = model.$createChildInstance(value, index)
  model.$data[index] = instance
  model.$addInterceptor(index)
  instance.$attach(model, index)
}

export function addAddPatch<T>(
  model: INodeInstance<unknown>,
  proposal: AddOperation
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'remove',
        path: proposal.path,
      },
    ],
  })
}

export function remove<T>(
  model: INodeInstance<T>,
  index: string | number
): RemoveChanges {
  const removed = getSnapshot(model.$data[index])
  delete model.$data[index]
  delete model[index]
  return {
    removed,
  }
}

export function addRemovePatch<T>(
  model: INodeInstance<unknown>,
  proposal: RemoveOperation,
  changes: RemoveChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'add',
        path: proposal.path,
        value: changes.removed,
      },
    ],
  })
}

export function copy<T>(
  model: INodeInstance<unknown>,
  proposal: CopyOperation
): CopyChanges {
  const from = getChildKey(model.$path, proposal.from)
  const to = getChildKey(model.$path, proposal.path)
  if(from === undefined) throw new Error('[CRAFTER] copy operation, operation.from is undefined')
  if(to === undefined) throw new Error('[CRAFTER] copy operation, operation.to is undefined')
  const replaced = getSnapshot(model[from])

  const instance = model.$createChildInstance(
    getSnapshot(model[from]),
    from.toString()
  )
  model.$data[to] = instance
  instance.$attach(model, to)
  
  return {
    replaced,
  }
}

export function addCopyPatch(
  model: INodeInstance<unknown>,
  proposal: CopyOperation,
  changes: CopyChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'replace',
        path: proposal.path,
        value: changes.replaced,
      },
    ],
  })
}

export function move(
  model: INodeInstance<unknown>,
  proposal: MoveOperation
): MoveChanges {
  const from = getChildKey(model.$path, proposal.from)
  const to = getChildKey(model.$path, proposal.path)
  if(from === undefined) throw new Error('[CRAFTER] move operation, operation.from is undefined')
  if(to === undefined) throw new Error('[CRAFTER] move operation, operation.to is undefined')
  const replaced = getSnapshot(model[to])
  const moved = getSnapshot(model[from])

  // Copy by reference
  model.$data[to] = model.$data[from]

  // Delete the original item
  delete model[from]
  delete model.$data[from]

  // Re attach the instance
  const movedInstance = toInstance(model.$data[to])
  movedInstance.$attach(model, to)

  return {
    moved,
    replaced,
  }
}

export function addMovePatch(
  model: INodeInstance<unknown>,
  proposal: MoveOperation,
  changes: MoveChanges
): void {
  model.$addPatch({
    forward: [proposal],
    backward: [
      {
        op: 'replace',
        path: proposal.path,
        value: changes.replaced,
      },
      {
        op: 'replace',
        path: proposal.from,
        value: changes.moved,
      },
    ],
  })
}
