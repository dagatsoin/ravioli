// import { getGlobal } from '../src/utils/utils'
// import { observable } from '../src/lib/observable'
import { toInstance,/*  toLeaf, noop ,*/ getSnapshot, getContext, applySnapshot, getValue, setValue } from '../../src/helpers'
// import { autorun, string, Reaction } from '../src'
// import { Graph } from '../src/Graph'
import { number, object, string, StepLifeCycle, Migration, autorun } from '../../src'

beforeEach(function() {
  (global as any).$$crafterContext.clearContainer()
})

describe('Data im/mutability', function(){
  const model = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      force: number(1),
      health: number(1)
    })
  }).create()
  const context = getContext(toInstance(model))
  const initialSnapshot = getSnapshot(model)
  context.step(() => model.stats.force++)

  test('value mutability', function() {
    expect(model.stats.force).toBe(2)
  })
  test('snapshot immutability', function(){
    expect(getSnapshot(model)).not.toEqual(initialSnapshot)
  })
})

describe('Migration generation', function() {
  describe('- All children value are replaced', function() {
    test('parent node writes the global mutation in the context', function() {
      const player = object({
        name: string('Fraktar'),
        level: number(1),
        stats: object({
          health: number(1),
          force: number(1)
        })
      }).create(undefined, {id: "player"})
      const context = getContext(toInstance(player))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_END, cb)
        expect(context.snapshot.migration).toEqual(toInstance(player.stats).$state.migration)
        expect(context.snapshot.migration).toEqual({
          forward: [
            {
              op: 'replace',
              value: {
                force: 2,
                health: 10
              },
              path: '/player/stats'
            }
          ],
          backward: [
            {
              op: 'replace',
              path: '/player/stats',
              value: {
                force: 1,
                health: 1
              }
            }
          ]
        })
      }
      context.addStepListener(StepLifeCycle.WILL_END, cb)
      context.step(() => player.stats = {
        health: 10,
        force: 2
      })
    })
  })
  describe('- Some children did not changed', function() {
    test('parent node writes the details of the mutation in the context', function() {
      const player = object({
        stats: object({
          health: number(1),
          force: number(1)
        })
      }).create(undefined, {id: "player2"})
      const context = getContext(toInstance(player))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_END, cb)
        expect(toInstance(toInstance(player.stats).$data.force).$state.didChange).toBeFalsy()
        expect(toInstance(toInstance(player.stats).$data.health).$state.didChange).toBeTruthy()
        expect(toInstance(player).$$container.snapshot.migration).toEqual({
          forward: [
            {
              op: 'replace',
              value: 10,
              path: '/player2/stats/health'
            }
          ],
          backward: [
            {
              op: 'replace',
              value: 1,
              path: '/player2/stats/health'
            }
          ]
        })
      }
      context.addStepListener(StepLifeCycle.WILL_END, cb)
      context.step(() => player.stats = {
        health: 10,
        force: 1
      })
    })
  })
})
 
describe('Reactivity', function() {
  const model = object({
    name: string('Fraktar'),
    level: number(1),
    stats: object({
      force: number(1),
      health: number(1)
    })
  }).create()
  const context = getContext(toInstance(model))
  const initialSnapshot = getSnapshot(model)

  // autorun list to dispose at the end
  const disposers: Array<()=>void> = []

  afterEach(function() {
   // disposers.forEach(d => d())
    applySnapshot(model, initialSnapshot)
  })

  describe('Node replacement', function() {
    test("- autorun react when root model value is replaced", function() {
      const model = object({
        name: string('Fraktar'),
      }).create(undefined)
      let run = 0
      const context = getContext(toInstance(model))
      
      disposers.push(autorun(() => {
        run++
        getValue(model)
      }))

      context.step(()=> setValue(model, {name: "Fraktos"}))
    
      expect(run).toBe(2)
    })
    
    test('- triggers observer tracking a leaf with changed value.', function() {
      let run = 0
      disposers.push(autorun(() => {
        // Observe the player
        model.stats.health
        run++
      }))
      const cb = () => {
        context.removeStepListener(StepLifeCycle.WILL_PROPAGATE, cb)
      }
      context.addStepListener(StepLifeCycle.WILL_PROPAGATE, cb)
      context.step(() => model.stats = { force: 1, health: 10})
      expect(run).toEqual(2)
    })
    test('- does not trigger observer tracking a leaf with unchanged value.', function() {
      let run = 0
      disposers.push(autorun(() => {
        // Observe the player
        model.stats.health
        run++
      }))
      context.step(() => model.stats = { force: 2, health: 1})
      expect(run).toEqual(1)
    })
    test('- triggers an observer tracking the node itself if its value changed.', function(){
      let run = 0

      // This autorun tracks the parent of the updated leaf and won't react
      disposers.push(autorun(() => {
        run++
        model.stats
      }))
      
      context.step(() => model.stats = { health: 5, force: 8})
      expect(run).toBe(2)
    })
    test('- does not trigger an observer tracking the node itself if its value did not changed.', function() {
      let run = 0

      // This autorun tracks the parent of the updated leaf and won't react
      disposers.push(autorun(() => {
        run++
        model.stats
      }))
      
      context.step(() => model.stats = { health: 1, force: 1})
      expect(run).toBe(1)
    })
  })
  describe('Leaf replacement', function() {
    test('- does not trigger an observable tracking the parent node.', function() {
      let a1 = 0
      let a2 = 0
      // This autorun tracks the parent of the updated leaf and won't react
      disposers.push(autorun(() => {
        a1++
        model.stats
      }))
      // This autorun tracks the updated leaf and will react
      disposers.push(autorun(() => {
        a2++
        model.stats.health
      }))
      context.step(() => model.stats.health++)
      expect(a1).toBe(1)
      expect(a2).toBe(2)
    })
    test('- triggers observer if the value changed.', function() {
      let run = 0
      disposers.push(autorun(() => {
        // Observe the player
        model.stats.health
        run++
      }))
      context.step(() => model.stats = { force: 1, health: 10})
      expect(run).toEqual(2)
    })
    test('- does not trigger observer if the value did not change.', function() {
      let run = 0
      disposers.push(autorun(() => {
        // Observe the player
        model.stats.health
        run++
      }))
      context.step(() => model.stats = { force: 2, health: 1})
      expect(run).toEqual(1)
    })
  })
})