import { computed } from "./observer/Computed"
import { IDerivation } from "./observer/IDerivation"
import { addHiddenProp } from "./utils/utils"
import { IContainer } from "./IContainer"

export type ITransformer<A, B> = (object: A) => B

type ITransformerOptions = {
    isBoxed?: boolean // Passed to the computed, applied only on object that we don't want to be deeply observable
    computedId?: string // ID of the computed
    valueId?: string // ID of the value of the computed
    contexts?: {output?: IContainer, source?: IContainer}
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
    const views: { [id: number]: IDerivation<B> } = {}
    const isBoxed = !!options?.isBoxed
    function createView(sourceObject: A): IDerivation<B> {
        return computed(
            () => transformer(sourceObject),
            {
                computedId: options?.computedId,
                valueId: options?.valueId,
                isBoxed,
                contexts: options?.contexts,
            })
    }

    return (object: A): B => {
        const identifier = getMemoizationId(object)
        let reactiveView = views[identifier]
        if (reactiveView) return reactiveView.get()
        // Not in cache; create a reactive view
        reactiveView = views[identifier] = createView(object)
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