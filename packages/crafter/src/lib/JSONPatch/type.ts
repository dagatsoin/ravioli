export enum Operation {
  // Basic
  add = 'add',
  remove = 'remove',
  replace = 'replace',
  move = 'move',
  copy = 'copy',
  
  // Array
  splice = 'splice',
  push = 'push',
  unshift = 'unshift',
  setLength = 'setLength',
  copyWithin = 'copyWithin',
  fill = 'fill',
  reverse = 'reverse',
  shift = 'shift',
  pop = 'pop',
  sort = 'sort',

  // Map
  clear = 'clear',
  delete = 'delete'
}
export type SortCommands = {
  // Id of the item
  id: string
  // Where is was
  from: number
  // Where it is now
  to: number
}[]

export type AddCommand<T = any> = Command & {
  op: Operation.add
  value: T
}

export type RemoveCommand = Command & {
  op: Operation.remove
}
export type ReplaceCommand<T = any> = Command & {
  op: Operation.replace
  value: T
}
export type MoveCommand = Command & {
  op: Operation.move
  from: string
}
export type CopyCommand = Command & {
  op: Operation.copy
  from: string
}
export type SpliceCommand<T = any> = Command & {
  op: Operation.splice
  value?: T[]
  start: number
  deleteCount?: number | undefined
}

export type PushCommand<T = any> = Command & {
  op: Operation.push
  value: T[]
}

export type UnshiftCommand<T = any> = Command & {
  op: Operation.unshift
  value: T[]
}

export type SetLengthCommand = Command & {
  op: Operation.setLength
  value: number
}

export type CopyWithinCommand = Command & {
  op: Operation.copyWithin
  target: number
  start: number
  end?: number
}

export type FillCommand<T = any> = Command & {
  op: Operation.fill
  value: T
  start?: number
  end?: number
}

export type ReverseCommand = Command & {
  op: Operation.reverse
}

export type ShiftCommand = Command & {
  op: Operation.shift
}

export type PopCommand = Command & {
  op: Operation.pop
}

export type SortCommand = Command & {
  op: Operation.sort
  commands: SortCommands
}

export type ClearCommand = Command & {
  op: Operation.clear
}

export type Command = {
  op: Operation
  path: string
  value?: any
}

export type BasicCommand<T = any> =
  | AddCommand<T>
  | RemoveCommand
  | ReplaceCommand<T>
  | MoveCommand
  | CopyCommand

export type ArrayCommand<T = any> =
  | BasicCommand<T>
  | PushCommand<T>
  | SetLengthCommand
  | SpliceCommand<T>
  | CopyWithinCommand
  | FillCommand<T>
  | ReverseCommand
  | ShiftCommand
  | PopCommand
  | SortCommand
  | UnshiftCommand<T>

export type MapCommand<T = any> = BasicCommand<T> | ClearCommand

export type Patch<C extends Command = any> = C[]

export type Migration<C extends Command = any, R extends Command = any> = {
  forward: C[]
  backward: R[]
}