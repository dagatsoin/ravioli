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
})