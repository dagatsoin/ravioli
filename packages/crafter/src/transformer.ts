import { computed, IComputed } from "./observer/Computed"
import { addHiddenProp } from "./utils/utils"
import { IContainer } from "./IContainer"

export type ITransformer<A, B> = (object: A, contexts?: Contexts) => B

type Contexts = {output?: IContainer, source?: IContainer}

type ITransformerOptions = {
    contexts?: Contexts
}
let memoizationId = 0

export function createTransformer<A, B>(
    transformer: ITransformer<A, B>,
    options?: ITransformerOptions
): ITransformer<A, B> {
    if(typeof transformer === "function" && transformer.length > 1) {
      throw new Error("createTransformer expects a function that accepts one argument")
    }

    // Memoizes: object id -> reactive view that applies transformer to the object
    const views: { [id: number]: IComputed<B> } = {}
    function createView(sourceObject: A, contexts?: Contexts): IComputed<B> {
        return computed(
            () => transformer(sourceObject),
            { contexts }
        )
    }

    return (object: A, contexts?: Contexts): B => {
        const identifier = getMemoizationId(object)
        let reactiveView = views[identifier]
        if (reactiveView) return reactiveView.get()
        // Not in cache; create a reactive view
        reactiveView = views[identifier] = createView(object, options?.contexts || contexts)
        return reactiveView.get()
    }
}

function getMemoizationId(object: any): string {
    const objectType = typeof object
    if (objectType === "string") return `string:${object}`
    if (objectType === "number") return `number:${object}`
    if (object === null || (objectType !== "object" && objectType !== "function"))
        throw new Error(
            `[Crafter] transform expected an object, function, string or number, got: ${String(
                object
            )}`
        )
    if (object.$transformId === undefined) {
      addHiddenProp(object, "$transformId", `memoizationId:${++memoizationId}`)
    }
    return object.$transformId
}