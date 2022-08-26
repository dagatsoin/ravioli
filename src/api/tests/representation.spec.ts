import { createContainer } from "../..";

describe("representation", function () {
    it("should have a ref to the model as default representation", function () {
        const container = createContainer<{ hp: number }>().create({ hp: 3 });
        expect(container.representationRef.current.hp).toBe(3);
    });

    it("should set a custom transformation", function() {
        const container = createContainer<{ hp: number }>()
            .addTransformation(({model}) => ({ health: model.hp }))
            .create({ hp: 3 });
        expect(container.representationRef.current).toBeDefined();
    });

    it("should bind the model to a static representation", function() {
        let nbOfComputation = 0
        const container = createContainer<{ hp: number }>()
            .addAcceptor("setHealth", { mutator: (model, hp: number) => model.hp = hp})
            .addActions({setHealth: "setHealth"})
            .addStaticTransformation(({model}) => {
                nbOfComputation++
                return {
                    useHealth: () => model.hp
                }
            })
            .create({ hp: 3 });
        expect(nbOfComputation).toBe(1)
        expect(container.representationRef.current.useHealth()).toBe(3);
        // change hp
        container.actions.setHealth(4)
        expect(nbOfComputation).toBe(1)
        expect(container.representationRef.current.useHealth()).toBe(4);
    })
})