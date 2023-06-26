import { createContainer } from "../..";

const comp = createContainer<{ name: string }>()
  .addAcceptor("setName", {
    condition: (_, { name }: { name: string }) => name.length > 5,
    mutator(data, { name }: { name: string }) {
      data.name = name;
    }
  })
  .addActions({
    setName: "setName",
  });

const {
  representationRef,
  actions: { setName },
} = comp.create({ name: "Fraktar" });

it("should accept value", function () {
  setName({ name: "Fraktos" });
  expect(representationRef.current.name).toEqual("Fraktos");
});

it("should not accept value", function () {
  setName({ name: "Frak" });
  expect(representationRef.current.name).toEqual("Fraktos");
});
