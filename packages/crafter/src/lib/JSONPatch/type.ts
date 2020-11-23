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

export type AddCommand<T = any> = {
  op: Operation.add
  path: string
  value: T
}

export type RemoveCommand = {
  op: Operation.remove
  path: string
}
export type ReplaceCommand<T = any> = {
  op: Operation.replace
  path: string
  value: T
}
export type MoveCommand = {
  op: Operation.move
  path: string
  from: string
}
export type CopyCommand = {
  op: Operation.copy
  path: string
  from: string
}
export type SpliceCommand<T = any> = {
  op: Operation.splice
  path: string
  value?: T[]
  start: number
  deleteCount?: number | undefined
}

export type PushCommand<T = any> = {
  op: Operation.push
  path: string
  value: T[]
}

export type UnshiftCommand<T = any> = {
  op: Operation.unshift
  path: string
  value: T[]
}

export type SetLengthCommand = {
  op: Operation.setLength
  path: string
  value: number
}

export type CopyWithinCommand = {
  op: Operation.copyWithin
  path: string
  target: number
  start: number
  end?: number
}

export type FillCommand<T = any> = {
  op: Operation.fill
  path: string
  value: T
  start?: number
  end?: number
}

export type ReverseCommand = {
  op: Operation.reverse
  path: string
}

export type ShiftCommand = {
  op: Operation.shift
  path: string
}

export type PopCommand = {
  op: Operation.pop
  path: string
}

export type SortCommandWithFn<T = any> = {
  op: Operation.sort
  path: string
  compareFn?: (a: T, b: T) => number
}

export type SortCommand = {
  op: Operation.sort
  path: string
  commands: SortCommands
}

export type ClearCommand = {
  op: Operation.clear
  path: string
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
  | SortCommandWithFn
  | UnshiftCommand<T>

export type MapCommand<T = any> = BasicCommand<T> | ClearCommand

export type Command =
  | BasicCommand
  | ArrayCommand
  | MapCommand

export type Patch<C extends Command = Command> = C[]

export type Migration<C extends Command = Command, R extends Command = Command> = {
  forward: C[]
  backward: R[]
}