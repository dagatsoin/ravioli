import { Graph, getTreeEdges } from "../src/Graph"

describe("Test implementation of graph utils", function() {
  const graph: Graph<{id: string}> = {edges: [], nodes: []}
  beforeEach(function() {
    graph.edges = [
      { target: '0', source: '1'},
      { target: '0', source: '2'},
      { target: '0', source: '3'},
      { target: '1', source: '2'},
      { target: '1', source: '6'},
      { target: '1', source: '7'},
      { target: '2', source: '3'},
      { target: '3', source: '4'},
      { target: '3', source: '5'}
    ]
    graph.nodes = [
      { id: '0' },
      { id: '1' },
      { id: '2' },
      { id: '3' },
      { id: '4' },
      { id: '4' },
      { id: '5' },
      { id: '6' },
      { id: '7' }
    ]
  })
  test("getSubTreeEdges", function() {
    expect(getTreeEdges({
      targetId: '0',
      graph
    })).toEqual([
      { target: '0', source: '1'},
      { target: '1', source: '6'},
      { target: '1', source: '7'},
    ])
  })
})