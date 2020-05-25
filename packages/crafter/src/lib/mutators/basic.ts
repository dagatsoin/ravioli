import { fail, getChildKey, getSnapshot, toInstance } from '../../helpers'
import {
  CopyChanges,
  INodeInstance,
  MoveChanges,
  RemoveChanges,
  ReplaceChanges,
} from '../INodeInstance'
import {
  AddCommand,
  CopyCommand,
  MoveCommand,
  RemoveCommand,
  ReplaceCommand,
  Migration,
  Operation,
} from '../JSONPatch'

export function createReplaceMigration<T>(
  command: ReplaceCommand<T>,
  changes: ReplaceChanges
): Migration<ReplaceCommand, ReplaceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.replace,
        path: command.path,
        value: changes.replaced,
      },
    ],
  }
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

export function createAddMigration<T>(
  command: AddCommand
): Migration<AddCommand, RemoveCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.remove,
        path: command.path,
      },
    ],
  }
}

export function remove<T>(
  model: INodeInstance<T>,
  index: string | number
): RemoveChanges | undefined {
  const removed = getSnapshot(model.$data[index])
  const isDeleted = delete model.$data[index]
  if (isDeleted) {
    return
  }
  delete model[index]
  return {
    removed,
  }
}

export function createRemoveMigration(
  command: RemoveCommand,
  changes: RemoveChanges
): Migration<RemoveCommand, AddCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.add,
        path: command.path,
        value: changes.removed,
      },
    ],
  }
}

export function copy<T>(
  model: INodeInstance<unknown>,
  command: CopyCommand
): CopyChanges | undefined {
  const from = getChildKey(model.$path, command.from)
  const to = getChildKey(model.$path, command.path)
  if(from === undefined) {
    fail('[CRAFTER] copy command, command.from is undefined')
    return
  }
  if(to === undefined) {
    fail('[CRAFTER] copy command, command.to is undefined')
    return
  }
  const replaced = getSnapshot(model[from])

  const instance = model.$createChildInstance(
    getSnapshot(model[from]),
    from.toString()
  )
  model.$data[to].$kill
  model.$data[to] = instance
  instance.$attach(model, to)
  
  return {
    replaced,
  }
}

export function createCopyMigration(
  command: CopyCommand,
  changes: CopyChanges
): Migration<CopyCommand, ReplaceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.replace,
        path: command.path,
        value: changes.replaced,
      },
    ],
  }
}

export function move(
  model: INodeInstance<unknown>,
  command: MoveCommand
): MoveChanges {
  const from = getChildKey(model.$path, command.from)
  const to = getChildKey(model.$path, command.path)
  if(from === undefined) throw new Error('[CRAFTER] move command, command.from is undefined')
  if(to === undefined) throw new Error('[CRAFTER] move command, command.to is undefined')
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

export function createMoveMigration(
  command: MoveCommand,
  changes: MoveChanges
): Migration<MoveCommand, ReplaceCommand> {
  return {
    forward: [command],
    backward: [
      {
        op: Operation.replace,
        path: command.path,
        value: changes.replaced,
      },
      {
        op: Operation.replace,
        path: command.from,
        value: changes.moved,
      },
    ],
  }
}
