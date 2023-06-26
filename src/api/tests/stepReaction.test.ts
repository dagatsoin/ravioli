import { createContainer, IInstance } from "../..";

it("should auto heal after a hit", function () {
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
    .addStepReaction({
      debugName: "autoHeal",
      // is hit
      when: ({ delta: { acceptedMutations } }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === "setHP" && payload.hp < 0
        ),
      do: ({ actions: { heal } }) => {
        console.log("Thrall is hit: -3");
        heal();
      },
    })
    .addStepReaction({
      debugName: "on heal",
      // is healed
      when: ({ delta: { acceptedMutations } }) =>
        acceptedMutations.some(
          ({ type, payload }) => type === "setHP" && payload.hp > 0
        ),
      do: () => {
        console.log("Thrall auto heal: +6");
        console.log("Thrall says: 'Hit me again ! Muhahahahaa'");
      },
    })
    .create({ hp: 10000 });

  Thrall.actions.hit();
  expect(Thrall.representationRef.current.hp).toBe(10003);
});

it("should restore deflect the first shot", function() {
  const Player = createContainer<{ hp: number, name: string }>()
    .addAcceptor("updateHP", {mutator: (data, hp: number) => data.hp += hp})
    .addActions({
      hit: (points: number) => [{type: "updateHP", payload: -points}],
      heal: (points: number) => [{type: "updateHP", payload: points}]
    })
    .addStepReaction({
      when: ({delta}) => delta.acceptedMutations.some(({type}) => type === 'updateHP'),
      do: ({actions, delta, data}) => {
        const pointToDeflect = delta.acceptedMutations.find(({type}) => type === 'updateHP')!.payload
        const myBattle = battles.find(b => b.some(({representationRef}) => representationRef.current.name === data.name))!
        const myOpponent = myBattle.find(({representationRef}) => representationRef.current.name !== data.name)!
        // Readd the hp points
        actions.hit(pointToDeflect)
        // Deflect to the opponent the same amount
        myOpponent.actions.hit(pointToDeflect)
      },
      debugName: "buff_deflect",
      once: true,
    })
  const Fraktar = Player.create({name: "Fraktar", hp: 10})
  const Dreadbond = Player.create({name: "Dreadbond", hp: 10})
  const battles = [[Fraktar, Dreadbond]]
  
  // Dreadbond hits Fraktar
  Fraktar.actions.hit(3)
  // Fraktar deflects the point to Dreadbond
  // Dreadbond has also its deflect and send back the hit
  // Finally, Dreadbond is untouched, Fraktar lost some points
  expect(Fraktar.representationRef.current.hp).toBe(7)
  expect(Dreadbond.representationRef.current.hp).toBe(10)
  // Dreadbond strikes again, there is no more deflect this time.
  Fraktar.actions.hit(3)
  expect(Fraktar.representationRef.current.hp).toBe(4)
  expect(Dreadbond.representationRef.current.hp).toBe(10)
})

it("should not rerun reaction when step has not been increased", function() {
  let ranReactionsNb = 0;
  const container = createContainer<{ hp: number }>()
    .addAcceptor("setHP", {
      condition: (data) => data.hp > 0,
      mutator: (data, hp) => data.hp == hp
    })
    .addActions({setHP: "setHP"})
    .addStepReaction({ do: () => ranReactionsNb++})
    .create({ hp: 0 });
  expect(container.stepId).toBe(0)
  container.actions.setHP(3) // will be rejected
  expect(container.stepId).toBe(0)
  expect(ranReactionsNb).toBe(0)
})
