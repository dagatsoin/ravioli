import { IContainer } from "../IContainer"

type Options = {
  id?: string
  context?: IContainer
}

export interface IFactory<OUTPUT, INPUT = OUTPUT> {
  create(value?: INPUT, options?: Options): OUTPUT
}
export type FactoryInput<F extends IFactory<any>> = NonNullable<
  Parameters<F['create']>[0]
>
export type FactoryOutput<F extends IFactory<any>> = ReturnType<F['create']>
