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

  // Wait for both async NAPs to complete, however long the machine takes
  for (let wait = 0; wait < 200 && saveOrder.length < 2; wait++) {
    await new Promise(r => setTimeout(r, 20));
  }

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

it("should run a one shot reaction twice when it starts a step at creation", function() {
  let welcomes = 0;
  const Fraktar = createContainer<{ hp: number }>()
    .addAcceptor("incHP", { mutator: (data) => data.hp++ })
    .addActions({ incHP: "incHP" })
    .addStepReaction({
      debugName: "welcome gift",
      once: true,
      do: ({ actions }) => {
        welcomes++;
        actions.incHP();
      },
    })
    .create({ hp: 1 });

  // Not what once says. At creation the gift starts a step at once, whose
  // reactions run the gift a second time before the first run disposed it.
  expect(welcomes).toBe(2);
  expect(Fraktar.representationRef.current.hp).toBe(3);

  // It is gone for good.
  Fraktar.actions.incHP();
  expect(welcomes).toBe(2);
  expect(Fraktar.representationRef.current.hp).toBe(4);
})

it("should run the reactions which follow a one shot reaction another pass disposed of", async function() {
  const loads: Array<() => void> = [];
  const saves: number[] = [];
  const Fraktar = createContainer<{ hp: number }>()
    .addAcceptor("incHP", { mutator: (data) => data.hp++ })
    .addActions({ incHP: "incHP" })
    // Loads something once, at creation, and is awaited.
    .addStepReaction({
      debugName: "load",
      once: true,
      awaitAsync: true,
      do: () => new Promise<void>((done) => { loads.push(done) }),
    })
    .addStepReaction({
      debugName: "save",
      awaitAsync: true,
      runOnInit: false,
      do: async ({ data }) => { saves.push(data.hp) },
    })
    .create({ hp: 1 });

  // A step is taken while the load of the creation is still running: the
  // pass of the step waits on a load of its own.
  Fraktar.actions.incHP();
  loads.forEach((done) => done());
  await new Promise(r => setTimeout(r, 0));

  // The pass of the creation disposed of the load meanwhile. The pass of the
  // step went on one reaction too far, and the step was never saved.
  expect(saves).toEqual([2]);
})

it("should not run a one shot reaction another pass disposed of before its turn", async function() {
  const writes: Array<() => void> = [];
  const loads: Array<() => void> = [];
  const Fraktar = createContainer<{ hp: number }>()
    .addAcceptor("incHP", { mutator: (data) => data.hp++ })
    .addActions({ incHP: "incHP" })
    .addStepReaction({
      debugName: "save",
      awaitAsync: true,
      do: () => new Promise<void>((done) => { writes.push(done) }),
    })
    .addStepReaction({
      debugName: "load",
      once: true,
      awaitAsync: true,
      do: () => new Promise<void>((done) => { loads.push(done) }),
    })
    .create({ hp: 1 });

  // The save of the creation is running, and so is the one of a step.
  Fraktar.actions.incHP();
  // The creation goes on to its load, which ends: it had its run.
  writes[0]();
  await new Promise(r => setTimeout(r, 0));
  loads[0]();
  await new Promise(r => setTimeout(r, 0));
  // The step goes on in turn, and finds the load gone.
  writes[1]();
  await new Promise(r => setTimeout(r, 0));

  expect(loads.length).toBe(1);
})

it("should await a reaction which hands back what can be awaited, a promise or not", async function() {
  const answers: Array<() => void> = [];
  const Counter = createContainer<{ count: number }>()
    .addAcceptor("inc", { mutator: (data) => data.count++ })
    .addActions({ increment: () => [{ type: "inc", payload: undefined }] })
    .addStepReaction({
      debugName: "persist",
      awaitAsync: true,
      runOnInit: false,
      // What a query builder hands back: not a Promise, but it has a then.
      do: () => ({ then: (done: () => void) => { answers.push(done) } }),
    })
    .create({ count: 0 });

  Counter.actions.increment();
  Counter.actions.increment();

  // The second one waits for the query of the first.
  await new Promise(r => setTimeout(r, 0));
  expect(Counter.stepId).toBe(1);

  answers[0]();
  await new Promise(r => setTimeout(r, 0));
  expect(Counter.stepId).toBe(2);
})
