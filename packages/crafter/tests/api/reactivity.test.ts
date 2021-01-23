import { object, number, getGlobal, toInstance, setValue, autorun, getContext, Operation, string } from '../../src'

/**
 * In some case (Computed scenario) the value may have more or less key than the previous value.
 *
 * Example : A Computed value "player"
 * If it is alive its stats are present in the return value. If it is dead the stats field are not present.
 *
 * After reran the computed expression, Computed will reset the value of its observable container.
 * If the previous value if this observable had a "stats" field, it must be removed.
 *b
 * In short, we must dynamicaly adapt the Computed Type on each run.
 *
 * To implements that, we need to check, for a given valid value, if the shape of the observable is conform.
 * If not, we need to detect the extra or missing keys in the Type properties and create or remove them.
 */


/* 
function remove() {
  context.step(() =>
    instance.$present([{ op: Operation.remove, path: '/local/level' }])
  )
}

function replace() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.replace,
        path: '/local/level',
        value: 101
      },
    ])
  )
}

function move() {
  context.step(() =>
    instance.$present([{ op: Operation.move, from: '/local/level', path: '/local/age' }])
  )
}

function copy() {
  context.step(() =>
    instance.$present([
      { op: Operation.copy, from: '/local/age', path: '/local/level' } as any,
    ])
  )
}

describe('reactivity', function() {
  describe('Object', function() {
    const players = object({
      local: object({
        name: string(),
        level: number(),
        age: number(),
        isAdmin: option
      })
    }).create()
    const instance = toInstance(players.local)
    const context = getContext(instance)

    beforeEach(function() {  
      context.step(function() {
        setValue(players, {
          local: {
            name: 'Fraktar',
            level: 100,
            age: 4
          }
        })
      })
    })

    test('add', function() {
      let runs = -1
      autorun(() => {
        players.local.isAdmin
        runs++
      })
      context.step(function() {
        instance.$present([
          {
            op: Operation.add,
            path: '/local/isAdmin',
            value: true
          },
        ])
      })

      
      add()
      expect(runs).toBe(1)
    })
    test('remove', function() {
      remove()
      expect(runs).toBe(0)
    })
    test('replace', function() {
      replace()
      expect(runs).toBe(1)
    })
    test('move', function() {
      move()
      expect(runs).toBe(1)
    })
    test('copy', function() {
      copy()
      expect(runs).toBe(1)
    })
  })
}) */