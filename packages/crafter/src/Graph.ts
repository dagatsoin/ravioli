import { IObserver } from "./observer";

export type Graph<T> = {
  nodes: Node<T>[];
  edges: Edge[];
};

export type Node<T> = T

export type Edge = {
  source: string
  target: string
}

function hasOneParent({
  id,
  dependencyGraph,
}: {
  id: string
  dependencyGraph: Graph<any>
}): boolean {
  let linkCount = 0
  for (const edge of dependencyGraph.edges) {
    if (edge.source === id) {
      // found a parent
      linkCount++
      if (linkCount > 1) {
        return false
      }
    }
  }
  return linkCount === 1
}

/**
 * Return the edges of a sub graph which starts from this target.
 * The returned graph is a tree. That means that the crawler will stop digging
 * as soon as a node has two parents.
 * Eg.  a -> b |
 *      c -> d -> e
 * 
 * If i want to get the sub tree from 'a', it will return 'a' and 'b' because 'e' has two parents ('d' and 'b')   
 */
export function getTreeEdges<T>({
  targetId,
  graph
}: {
  targetId: string
  graph: Graph<T>
}): Edge[] {
  const firstLevelEdges = graph.edges.filter(
    edge => edge.target === targetId
  )
  .filter(({source}) => hasOneParent({ id: source, dependencyGraph: graph }))
  
  return [
    ...firstLevelEdges, 
    ...firstLevelEdges
    .flatMap(({source}) => getTreeEdges({
      targetId: source,
      graph,
    }))
  ]
}

export function removeNode({
  nodeId,
  dependencyGraph,
}: {
  nodeId: string
  dependencyGraph: Graph<IObserver>
}): void {
  const nodeIndex = dependencyGraph.nodes.findIndex(node => node.id === nodeId)
  if (nodeIndex === -1) {
    throw new Error(
      `ST Manager > dependency graph > removeNode. Node ${nodeId} does not exist.`
    )
  }
  dependencyGraph.nodes.splice(nodeIndex, 1)
}

export function removeNodeEdges({
  nodeId,
  dependencyGraph,
}: {
  nodeId: string
  dependencyGraph: Graph<any>
}): void {
  dependencyGraph.edges = dependencyGraph.edges.filter(
    edge => edge.source === nodeId || edge.target === nodeId
  )
}