// import { ArrayInstance } from './array';
import { InferSubType } from './lib/IType';
import { INodeInstance } from './lib/INodeInstance';
export type InstanceFromValue<T> = T// T extends Map<any, any> ? INodeInstance<Map<any, InferSubType<T>['Type']>, Map<any, Parameters<InferSubType<T>['create']>[0]> | [any, Parameters<InferSubType<T>['create']>[0]][]> : T extends any[] ? ArrayInstance<InferSubType<T>['Type']> : INodeInstance<T>;
