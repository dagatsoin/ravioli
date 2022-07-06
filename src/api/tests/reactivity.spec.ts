import { reaction } from "mobx"
import { createContainer } from "../.."

describe("reactivity", function() {
    const user = createContainer<{name: string, hp: number}>()
    .addAcceptor("setName", { mutator: (model, { name }: { name: string }) => (model.name = name) })
    .addAcceptor("setHP", { mutator: (model, { hp }: { hp: number }) => (model.hp = hp) })
    .addControlStatePredicate("IS_ALIVE", ({ model }) => model.hp > 0)
    .addControlStatePredicate("IS_DEAD", ({ model }) => model.hp <= 0)
    .addActions({
        rename: "setName",
        setHP: "setHP",
    })
    .addTransformation((model) => ({...model}))
    .create({name: "Fraktos", hp: 1})

    test("stepId", function() {
        let isRun = false
        const dispose = reaction(
            () => user.stepId,
            stepId => {
                isRun = true
                console.log("RUN1")
                expect(stepId).toBe(1)
                dispose()
            }
        )
        user.actions.rename({name: "Fraktar"})
        expect(isRun).toBeTruthy()
    })

    test("control states", function() {
        let isRun = false
        expect(user.controlStates).toEqual(["IS_ALIVE"])
        reaction(
            () => user.controlStates[0],
            cs => {
                isRun = true
                console.log("RUN2")
                expect(cs).toBe("IS_DEAD")
            }
        )
        user.actions.setHP({hp: 0})
        expect(isRun).toBeTruthy()
    })
})