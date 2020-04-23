// Track the observability of an object instead of tracking its value changes.
// In other words, we do not track the value but just if a value is observed or not.
// Eg. In React, some fields used in the render function may be some computed values.
// If those computed values depend on props and state we need to know about when the props and state changes
// without enforce them as observables.
// So at each Component update (via lifecycle or via custom getter/setter) we trigger a tracker
// to let Observer/Computed know about something has changes in props/state,

import { autorun, createTracker, computed } from '../src'

test("tracker", function() {
  const tracker = createTracker('props')
  const model = {
    _name: "Fraktar",
    get name(): string {
      tracker.reportObserved()
      return this._name
    },
    set name(s: string) {
      this._name = s
      tracker.reportChanged()
    }
  }
  let run = 0

  const name = computed(() => model.name, {isBoxed: true})

  let test!: string 

  autorun(() => {
    test = name.get()
    run++
  })
  
  model.name = "Fraktos"
  
  expect(test).toEqual('Fraktos')
  expect(run).toEqual(2)
})