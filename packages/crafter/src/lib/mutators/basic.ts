import { fail, getChildKey, getSnapshot, toInstance, warn } from '../../helpers'
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

export function remove(
  model: INodeInstance<any>,
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
  const replaced = getSnapshot(model.$data[from])

  const instance = model.$createChildInstance(
    getSnapshot(model.$data[from]),
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
): MoveChanges | undefined {
  const from = getChildKey(model.$path, command.from)
  const to = getChildKey(model.$path, command.path)
  if(from === undefined) {
    warn('[CRAFTER] move command, command.from is undefined')
    return
  }
  if(to === undefined) {
    warn('[CRAFTER] move command, command.to is undefined')
    return
  }
  const replaced = getSnapshot(model.$data[to])
  const moved = getSnapshot(model.$data[from])

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
