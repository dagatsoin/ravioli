export type Snapshot<T> = T extends Map<any, any> ? T | [any, any][] : T
