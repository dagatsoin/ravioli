import { Graph, getGraphEdgesFrom, getAllPathsFrom, getAllPathsTo, topologicalSort } from "../../src/Graph"

describe("Test implementation of graph utils", function() {
/*   
               +-----------------+7
               |
               |
               |
               v
+------------+ 1 <---------------+6
|              ^
|              |
|              |
v              +
0 <----------+ 2        +--------+5
^              ^        |
|              |        |
|              |        |
|              +        |
+------------+ 3 <------+--------+4
*/
  const graph: Graph<{id: string}> = {edges: [
    { target: '0', source: '1'},
    { target: '0', source: '2'},
    { target: '0', source: '3'},
    { target: '1', source: '2'},
    { target: '1', source: '6'},
    { target: '1', source: '7'},
    { target: '2', source: '3'},
    { target: '3', source: '4'},
    { target: '3', source: '5'}
  ], nodes: [
    { id: '0' },
    { id: '1' },
    { id: '2' },
    { id: '3' },
    { id: '4' },
    { id: '4' },
    { id: '5' },
    { id: '6' },
    { id: '7' }
  ]}

/*
A1 <--+ C4 <-------------------+
         ^                     |
         |                     |
         +                     +
        C3         C0 <-----+ O0
         ^          +
         |          |
         +          |
A0 <--+ C2 <--------+
                    |
                    |
                    +
                   C1 <-----+ O1
*/
  const graph2: Graph<{id: string}> = {
    edges: [
      { target: 'C0', source: 'O0'},
      { target: 'C2', source: 'C0'},
      { target: 'A0', source: 'C2'},
      { target: 'C3', source: 'C2'},
      { target: 'C4', source: 'C3'},
      { target: 'A1', source: 'C4'},
      { target: 'C4', source: 'O0'},
      { target: 'C1', source: 'O1'},
      { target: 'C2', source: 'C1'},
    ],
    nodes: [
      { id: 'O0' },
      { id: 'O1' }, 
      { id: 'C0' },
      { id: 'C1' },
      { id: 'C2' },
      { id: 'C3' },
      { id: 'C4' },
      { id: 'A0' },
      { id: 'A1' }
    ]
  }

  /*
A1 <--+ C4 <-------------------+
         ^                     |
         |                     |
         +                     +
        C3         C0 <-----+ O0
         ^          +
         |          |
         +          |
A0 <--+ C2 <--------+
                    |
                    |
                    +
A2                 C1 <-----+ O1
*/
const graph3: Graph<{id: string}> = {
  edges: [
    { target: 'C0', source: 'O0'},
    { target: 'C2', source: 'C0'},
    { target: 'A0', source: 'C2'},
    { target: 'C3', source: 'C2'},
    { target: 'C4', source: 'C3'},
    { target: 'A1', source: 'C4'},
    { target: 'C4', source: 'O0'},
    { target: 'C1', source: 'O1'},
    { target: 'C2', source: 'C1'},
  ],
  nodes: [
    { id: 'O0' },
    { id: 'O1' }, 
    { id: 'C0' },
    { id: 'C1' },
    { id: 'C2' },
    { id: 'C3' },
    { id: 'A2' },
    { id: 'C4' },
    { id: 'A0' },
    { id: 'A1' }
  ]
}
  
  test("getSubTreeEdges", function() {
    expect(getGraphEdgesFrom({
      targetId: '0',
      graph
    })).toEqual([
      { target: '0', source: '1'},
      { target: '1', source: '6'},
      { target: '1', source: '7'},
    ])
  })

  test("getAllPathsFrom", function() {
    expect(getAllPathsFrom({
      sourceId: 'O0',
      graph: graph2
    }).sort()).toEqual([
      ['O0', 'C0', 'C2', 'A0'],
      ['O0', 'C0', 'C2', 'C3', 'C4', 'A1'],
      ['O0', 'C4', 'A1']
    ].sort())
    expect(getAllPathsFrom({
      sourceId: '5',
      graph
    }).sort()).toEqual([
      ['5', '3', '2', '0'],
      ['5', '3', '2', '1', '0'],
      ['5', '3', '0']
    ].sort())
  })

  test("getAllPathsTo", function() {
    expect(getAllPathsTo({
      targetId: 'A1',
      graph: graph2
    }).sort()).toEqual([
      ['O0', 'C0', 'C2', 'C3', 'C4', 'A1'],
      ['O0', 'C4', 'A1'],
      ['O1', 'C1', 'C2', 'C3', 'C4', 'A1']
    ].sort())
    expect(getAllPathsTo({
      targetId: '0',
      graph
    }).sort()).toEqual([
      ['4', '3', '2', '0'],
      ['4', '3', '2', '1', '0'],
      ['4', '3', '0'],
      ['5', '3', '2', '0'],
      ['5', '3', '2', '1', '0'],
      ['5', '3', '0'],
      ['6', '1', '0'],
      ['7', '1', '0']
    ].sort())
  })

  test("topologicalSort", function() {
    expect(topologicalSort(graph3, "id")).toEqual([
      "O0",
      "C0",
      "O1",
      "C1",
      "C2",
      "A0",
      "C3",
      "C4",
      "A1",
      "A2",
    ])
  })
})