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
    .addTransformation(({model}) => ({...model}))
    .create({name: "Fraktos", hp: 1})

    test("stepId", function() {
        let isRan = false
        const dispose = reaction(
            () => user.stepId,
            stepId => {
                isRan = true
                expect(stepId).toBe(1)
                dispose()
            }
        )
        user.actions.rename({name: "Fraktar"})
        expect(isRan).toBeTruthy()
    })

    test("control states", function() {
        let isRan = false
        expect(user.controlStates).toEqual(["IS_ALIVE"])
        reaction(
            () => user.controlStates[0],
            cs => {
                isRan = true
                expect(cs).toBe("IS_DEAD")
            }
        )
        user.actions.setHP({hp: 0})
        expect(isRan).toBeTruthy()
    })

    test("representation", function() {
        let isRan = false
        expect(user.representationRef.current.hp).toEqual(0)
        reaction(
            () => user.representationRef.current.hp,
            hp => {
                isRan = true
                expect(hp).toBe(1)
            }
        )
        user.actions.setHP({hp: 1})
        expect(isRan).toBeTruthy()
    })
})