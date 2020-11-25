import {
  object,
  string,
  number,
  toInstance,
  getContext,
  setValue,
  Operation,
  getValue,
  boolean,
  autorun,
} from '../../src'
import { array } from '../../src/array'

describe('mutation', function() {
  test('replace leaf child', function() {
    const Players = array(string())
    const players = Players.create(['Fraktar', 'Dreadbond', 'Elwein'])
    getContext(toInstance(players)).step(() => (players[0] = 'Fraktos'))
    expect(players[0]).toBe('Fraktos')
  })

  test('replace node child', function() {
    const players = array(
      object({
        name: string(),
        level: number(),
        hp: number(),
      })
    ).create([
      {
        name: 'Fraktar',
        level: 1,
        hp: 10,
      },
    ])
    getContext(toInstance(players)).step(
      () =>
        (players[0] = {
          name: 'Fraktos',
          level: 2,
          hp: 100,
        })
    )
    expect(toInstance(players[0])).toBeTruthy()
    expect(toInstance(players[0]).$value).toEqual({
      name: 'Fraktos',
      level: 2,
      hp: 100,
    })
  })
  test('replace whole array', function() {
    const players = array(
      object({
        name: string(),
        level: number(),
        hp: number(),
      })
    ).create([
      {
        name: 'Fraktar',
        level: 1,
        hp: 10,
      },
      {
        name: 'Elwëïn',
        level: 1,
        hp: 10,
      },
    ])
    getContext(toInstance(players)).step(() =>
      setValue(toInstance(players), [
        {
          name: 'Troll',
          level: 1,
          hp: 1,
        },
      ])
    )
    expect(players.length).toBe(1)
    expect(toInstance(players).$value).toEqual([
      {
        name: 'Troll',
        level: 1,
        hp: 1,
      },
    ])
  })
})

const players = array(
  object({
    name: string(),
    level: number(),
  })
).create()
const instance = toInstance(players)
const context = getContext(instance)

beforeEach(function() {
  context.step(function() {
    setValue(players, [
      {
        name: 'Fraktar',
        level: 100,
      },
      {
        name: 'Elwëïn',
        level: 100,
      },
      {
        name: 'Dreadbond',
        level: 100,
      },
    ])
  })
})

function add() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.add,
        path: '/3',
        value: {
          name: 'Charlize',
          level: 1,
        },
      },
    ])
  )
}

function remove() {
  context.step(() =>
    instance.$present([{ op: Operation.remove, path: '/0' }])
  )
}

function replace() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.replace,
        path: '/0',
        value: {
          name: 'Fraktos',
          level: 100,
        },
      },
    ])
  )
}

function move() {
  context.step(() =>
    instance.$present([{ op: Operation.move, from: '/0', path: '/1' }])
  )
}

function copy() {
  context.step(() =>
    instance.$present([
      { op: Operation.copy, from: '/0', path: '/1' } as any,
    ])
  )
  expect(players[0].name).toBe(players[1].name)
}

function spliceFlush() {
  context.step(() => instance.$present([
    {
      op: Operation.splice,
      path: '/',
      start: 0,
      deleteCount: players.length,
    },
  ]))
}

function spliceInsertData() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.splice,
        path: '/',
        start: 2,
        value: [
          {
            name: 'Troll',
            level: 0,
          },
          {
            name: 'Troll',
            level: 0,
          },
        ],
      },
    ])
  )
}

function spliceReplaceData() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.splice,
        path: '/',
        start: 1,
        deleteCount: 2,
        value: [
          {
            name: 'Troll',
            level: 0,
          },
          {
            name: 'Troll',
            level: 0,
          },
        ],
      },
    ])
  )
}

function push() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.push,
        path: '/',
        value: [
          {
            name: 'Troll',
            level: 0,
          },
        ],
      },
    ])
  )
}

function pop() {
  context.step(() => instance.$present([{ op: Operation.pop, path: '/' }]))
}

function shift() {
  context.step(() =>
    instance.$present([{ op: Operation.shift, path: '/' }])
  )
}

function unshift() {
  context.step(() =>
    instance.$present([
      {
        op: Operation.unshift,
        path: '/',
        value: [
          {
            name: 'Troll',
            level: 0,
          },
        ],
      },
    ])
  )
}

function setLength() {
  context.step(() =>
    instance.$present([{ op: Operation.replace, path: '/length', value: 1 }])
  )
}

describe('reactiviy', function() {
  test('rerun iteration only when observed value changed', function() {
    const model = array(
      object({
        isAlive: boolean(),
        name: string(),
      })
    ).create([
      {
        isAlive: true,
        name: 'Fraktar',
      },
      {
        isAlive: false,
        name: 'Elwëïn',
      },
      {
        isAlive: true,
        name: 'Charlize',
      },
    ])

    let runs = 0
    const dispose = autorun(function() {
      model.filter(({ isAlive }) => isAlive)
      runs++
    })
    expect(runs).toBe(1)
    getContext(toInstance(model)).step(() => (model[1].isAlive = true))
    expect(runs).toBe(2)
    getContext(toInstance(model)).step(() => (model[0].name = 'Fraktos'))
    expect(runs).toBe(2)
    dispose()
  })

  describe('React to length change', function() {
    let runs = 0
    beforeEach(function() {
      runs = 0
    })

    autorun(() => {
      players.length
      runs++
    })

    test('add', function() {
      add()
      expect(runs).toBe(1)
    })
    test('remove', function() {
      remove()
      expect(runs).toBe(1)
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
  
    // Array methods which change length
    test('splice: empty array', function() {
      spliceFlush()
      expect(runs).toBe(1)
    })
    test('splice: insert data', function() {
      spliceInsertData()
      expect(runs).toBe(1)
    })
    test('splice: replace data', function() {
      spliceReplaceData()
      expect(runs).toBe(1)
    })
    test('push', function() {
      push()
      expect(runs).toBe(1)
    })
    test('pop', function() {
      pop()
      expect(runs).toBe(1)
    })
    test('shift', function() {
      shift()
      expect(runs).toBe(1)
    })
    test('unshift', function() {
      unshift()
      expect(runs).toBe(1)
    })
    test('setLength', function() {
      setLength()
      expect(runs).toBe(1)
    })
  })
})

describe('JSON commands', function() { 
  test('add', function() {
    add()
    expect(players.length).toBe(4)
  })
  test('remove', function() {
    remove()
    expect(players.length).toBe(2)
  })
  test('replace', function() {
    replace()
    expect(players[0].name).toBe('Fraktos')
  })
  test('move', function() {
    move()
    expect(players[0].name).toBe('Elwëïn')
    expect(players[1].name).toBe('Fraktar')
  })
  test('copy', function() {
    copy()
    expect(players[0].name).toBe(players[1].name)
  })

  // Array methods which change length
  test('splice: empty array', function() {
    spliceFlush()
    expect(players.length).toBe(0)
  })
  test('splice: insert data', function() {
    spliceInsertData()
    expect(players.length).toBe(5)
    expect(players[2]).toEqual({
      name: 'Troll',
      level: 0,
    })
    expect(players[3]).toEqual({
      name: 'Troll',
      level: 0,
    })
  })
  test('splice: replace data', function() {
    spliceReplaceData()
    expect(players.length).toBe(3)
    expect(getValue(players)).toEqual([
      {
        name: 'Fraktar',
        level: 100,
      },
      {
        name: 'Troll',
        level: 0,
      },
      {
        name: 'Troll',
        level: 0,
      },
    ])
  })
  test('push', function() {
    push()
    expect(players[3].name).toBe('Troll')
  })
  test('pop', function() {
    pop()
    expect(players.length).toBe(2)
  })
  test('shift', function() {
    shift()
    expect(players.length).toBe(2)
  })
  test('unshift', function() {
    unshift()
    expect(players[0].name).toBe('Troll')
  })
  test('setLength', function() {
    setLength()
    expect(players.length).toBe(1)
  })
})