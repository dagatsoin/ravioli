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
      do: ({ compose }) => {
        console.log("Thrall is hit: -3");
        compose(({heal}) => [heal(), heal()]);
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
  expect(Thrall.representationRef.current.hp).toBe(10009);
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
    .addStepReaction({
      runOnInit: false,
      do: () => ranReactionsNb++ }
    )
    .create({ hp: 0 });
  expect(container.stepId).toBe(0)
  container.actions.setHP(3) // will be rejected
  expect(container.stepId).toBe(0)
  expect(ranReactionsNb).toBe(0)
})

test("rerun all reactions", function() {
  let ranReactionsNb = 0;
  const container = createContainer<{ hp: number }>()
    .addAcceptor("incHP", {
      mutator: (model) => model.hp++
    })
    .addControlStatePredicate("isSafe", ({data}) => data.hp > 1)
    .addActions({incHP: "incHP"})
    .addStepReaction({ 
      when: ({ delta: { controlStates } }) => controlStates.includes('isSafe'),
      once: true,
      do: () => ranReactionsNb++})
    .addStepReaction({ 
      when: ({ delta: { controlStates } }) => controlStates.includes('isSafe'),
      once: true,
      do: () => ranReactionsNb++})
    .addStepReaction({ 
      when: ({ delta: { controlStates } }) => controlStates.includes('isSafe'),
      once: true,
      do: () => ranReactionsNb++})
    .create({ hp: 1 });

  container.actions.incHP()
  expect(ranReactionsNb).toBe(3)
})


test("autorun on instance creation", function() {
  const container = createContainer<{ hp: number }>()
    .addAcceptor("setHP", {
      mutator: (model, hp) => model.hp = hp
    })
    .addControlStatePredicate("isAlive", ({ data }) => data.hp > 0)
    .addControlStatePredicate("isDead", ({ data }) => data.hp <= 0)
    .addActions({
      setHP: "setHP"
    })
    .addStepReaction({
      debugName: "Res",
      when: ({ delta: { controlStates}}) => controlStates.includes('isDead'),
      do: ({ actions }) => actions.setHP(10),
    })
    .create({ hp: 0 })

    expect(container.representationRef.current.hp).toBe(10)
})

test("should await async NAP before allowing next step", async function() {
  const saveOrder: { count: number; step: number }[] = [];

  const Counter = createContainer<{ count: number }>()
    .addAcceptor("inc", { mutator: (data) => data.count++ })
    .addActions({ increment: () => [{ type: "inc", payload: undefined }] })
    .addStepReaction({
      debugName: "persist",
      awaitAsync: true,
      runOnInit: false,
      do: async ({ data }) => {
        // Simulate variable latency - first save is slow, second is fast
        const delay = saveOrder.length === 0 ? 50 : 10;
        await new Promise(r => setTimeout(r, delay));
        saveOrder.push({ count: data.count, step: Counter.stepId });
      },
    })
    .create({ count: 0 });

  expect(Counter.stepId).toBe(0);

  // Two rapid increments (called synchronously)
  Counter.actions.increment();  // Step 0 → 1, NAP awaits
  Counter.actions.increment();  // Buffered while NAP running, then Step 1 → 2

  // Wait for both async NAPs to complete
  await new Promise(r => setTimeout(r, 150));

  // Each action processed in its own step
  expect(Counter.stepId).toBe(2);

  // Saves completed in order (step 1 before step 2) despite different latencies
  expect(saveOrder).toEqual([
    { count: 1, step: 1 },  // First action, first step
    { count: 2, step: 2 },  // Second action, second step (was buffered)
  ]);
})

test("should initialize stepId from options for hydration", function() {
  const Counter = createContainer<{ count: number }>()
    .addAcceptor("inc", { mutator: (data) => data.count++ })
    .addActions({ increment: () => [{ type: "inc", payload: undefined }] });

  // Create instance without initialStepId (default behavior)
  const defaultCounter = Counter.create({ count: 0 });
  expect(defaultCounter.stepId).toBe(0);

  // Create instance with initialStepId (for hydration from persisted state)
  const hydratedCounter = Counter.create({ count: 5 }, { initialStepId: 42 });
  expect(hydratedCounter.stepId).toBe(42);

  // Verify actions still increment stepId from the initial value
  hydratedCounter.actions.increment();
  expect(hydratedCounter.stepId).toBe(43);
  expect(hydratedCounter.representationRef.current.count).toBe(6);
})