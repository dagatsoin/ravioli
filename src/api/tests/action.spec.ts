import { createContainer } from "../..";

test("declare action by mutation name", function () {
  const user = createContainer<{
    name: string;
  }>()
    .addAcceptor("setName", {
      mutator(data, { name }: { name: string }) {
        data.name = name;
      },
    })
    .addActions({
      rename: "setName",
    })
    .create({ name: "Fraktos" });

  user.actions.rename({ name: "Fraktar" });

  expect(user.representationRef.current.name).toBe("Fraktar");
});

test("synchronous action", function () {
  const Thrall = createContainer<{ hp: number }>()
    .addAcceptor("setHP", {
      mutator(data, { hp }: { hp: number }) {
        data.hp = data.hp + hp;
      },
    })
    .addActions({
      hit() {
        return [
          {
            type: "setHP",
            payload: {
              hp: -3,
            },
          },
        ];
      },
      heal() {
        return [
          {
            type: "setHP",
            payload: {
              hp: 6,
            },
          },
        ];
      },
    })
    .create({ hp: 10000 });

  Thrall.actions.hit();
  expect(Thrall.representationRef.current.hp).toBe(9997);

  Thrall.actions.heal();
  expect(Thrall.representationRef.current.hp).toBe(10003);
});

test("asynchronous action", function (done) {
  const app = createContainer<{ isStale: boolean }>()
    .addAcceptor("clean", {
      mutator(data, ) {
        data.isStale = false;
      },
    })
    .addActions({
      save: {
        isAsync: true,
        action() {
          return new Promise((resolve) => {
            resolve([
              {
                type: "clean",
                payload: undefined,
              },
            ]);
          });
        },
      },
    })
    .addStepReaction({
      debugName: "stop",
      runOnInit: false,
      do({ representation }) {
        expect(representation.isStale).toBeFalsy();
        done();
      },
    })
    .create({ isStale: true });

  app.actions.save();
});

test("chained actions", async function () {
  const app = createContainer<{ hp: number }>()
    .addAcceptor("decHP", {
      mutator(data) {
        data.hp--;
      },
    })
    .addActions({
      hit: {
        isAsync: true,
        action() {
          return new Promise((resolve) => {
            console.log("casting fireball")
            setTimeout(() => resolve([
              {
                type: "decHP",
                payload: undefined,
              },
            ]), 1000)
          });
        },
      },
    })
    .addStepReaction({
      debugName: "is dead",
      when: (model) => model.data.hp === 0,
      do() {
        expect(app.representationRef.current.hp).toBe(0);
      },
    })
    .create({ hp: 2 });

  // Saga
  const startAt = Date.now()
  console.log((Date.now() - startAt)/1000)
  for(let i of [0,1]) {
    console.log((Date.now() - startAt)/1000)
    await app.actions.hit()
    console.log((Date.now() - startAt)/1000)
  }
});

it("should cancel the asynchronous save action", function () {
  const app = createContainer<{ isStale: boolean }>()
    .addAcceptor("clean", {
      mutator(data, ) {
        data.isStale = false;
      },
    })
    .addActions({
      save: {
        isAsync: true,
        isCancelable: true,
        action() {
          return new Promise((resolve) => {
            resolve([
              {
                type: "clean",
                payload: undefined,
              },
            ]);
          });
        },
      },
      cancel() {
        return [];
      },
    })
    .addStepReaction({
      when: ({ delta: { acceptedMutations } }) =>
        !acceptedMutations.length,
      do: ({ representation }) => {
        expect(representation.isStale).toBeTruthy();
      },
    })
    .create({ isStale: true });

  app.actions.save();
  app.actions.cancel();
});

test("compose actions", function () {
  const grunt = createContainer<{
    hp: number;
  }>()
    .addAcceptor("setHP", {
      mutator(data, { hp }: { hp: number }) {
        data.hp = data.hp + hp;
      },
    })
    .addActions({
      hit() {
        return [
          {
            type: "setHP",
            payload: {
              hp: -5,
            },
          },
        ];
      },
    })
    .create({ hp: 10 });

  grunt.compose(({ hit }) => [hit(), hit()]);

  expect(grunt.representationRef.current.hp).toBe(0); // static would be 10003
});