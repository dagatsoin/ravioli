export type Snapshot<T> = T extends Map<any, any> ? T | Array<[any, any]> : T
