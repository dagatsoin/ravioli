import { createContainer } from "../..";

test("declare action by mutation name", function () {
  const user = createContainer<{
    name: string;
  }>()
    .addAcceptor("setName", (model) => ({
      mutator({ name }: { name: string }) {
        model.name = name;
      },
    }))
    .addActions({
      rename: "setName",
    })
    .create({ name: "Fraktos" });

  user.actions.rename({ name: "Fraktar" });

  expect(user.representationRef.current.name).toBe("Fraktar");
});

test("synchronous action", function () {
  const Thrall = createContainer<{ hp: number }>()
    .addAcceptor("setHP", (model) => ({
      mutator({ hp }: { hp: number }) {
        model.hp = model.hp + hp;
      },
    }))
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
    .addAcceptor("clean", (model) => ({
      mutator() {
        model.isStale = false;
      },
    }))
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
    .addStepReaction("stop", {
      effect() {
        expect(app.representationRef.current.isStale).toBeFalsy();
        done();
      },
    })
    .create({ isStale: true });

  app.actions.save();
});

it("should cancel the asynchronous save action", function () {
  const app = createContainer<{ isStale: boolean }>()
    .addAcceptor("clean", (model) => ({
      mutator() {
        model.isStale = false;
      },
    }))
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
    .addStepReaction("", {
      predicate: ({ delta: { acceptedMutations } }) =>
        !acceptedMutations.length,
      effect: () => {
        expect(app.representationRef.current.isStale).toBeTruthy();
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
    .addAcceptor("setHP", (model) => ({
      mutator({ hp }: { hp: number }) {
        model.hp = model.hp + hp;
      },
    }))
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