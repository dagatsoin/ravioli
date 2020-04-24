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
 * Return the edges of a sub graph which leads to this target.
 * The returned graph is only dependant of the target.
 * That means that the crawler will stop digging as soon as
 * a parent of a node is dependant of another source.
 * Eg.       a -> b -> c
 *                |    | 
 *                v    v
 *      x -> y -> e <- d
 * 
 * If i want to get the sub tree from 'a', it will return 'a', 'b', 'c' and 'd'
 * because 'y' is not dependant from 'a'
 */
export function getGraphEdgesFrom<T>({
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
    .flatMap(({source}) => getGraphEdgesFrom({
      targetId: source,
      graph,
    }))
  ]
}


/**
 * Return the node edges
 * @param nodeId 
 * @param graph 
 */
export function getEdgesOf(nodeId: string, graph: Graph<any>) {
  return  graph.edges
  .filter(e => (
    e.source === nodeId ||
    e.target === nodeId
  ))
}


/**
 * Return true if the given edge are the same
 * @param edge0
 * @param edge1 
 */
export function isSameEdge(edge0: Edge, edge1: Edge): boolean {
  return edge0.source === edge1.source && edge0.target === edge1.target
}

/**
 * Return true if the graph has the given edge
 * @param edge 
 * @param graph 
 */
export function hasEdge(edge: Edge, graph: Graph<any>): boolean {
  return graph.edges.some((_edge) => isSameEdge(edge, _edge))
}

export function removeNode({
  node,
  dependencyGraph,
}: {
  node: any
  dependencyGraph: Graph<any>
}): void {
  const nodeIndex = dependencyGraph
    .nodes
    .indexOf(node)
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
    edge => edge.source !== nodeId && edge.target !== nodeId
  )
}

/**
 * A depth first traversal implementation.
 * 
 * onNode(nodeId: string): void
 * Called on each step
 * 
 * onFork(): void
 * Called each time the crawler reaches a fork.
 * 
 * onLeaf(): void
 * Called each time the crawler reaches a leaf. 
 *
 * onStepBack(): void
 * Called when the crawler step back to the previous node.
 */
function crawlDepthFirst({
  sourceId,
  graph,
  onNode,
  onFork,
  onLeaf,
  onStepBack
}: {
  sourceId: string
  graph: Graph<any>
  onNode?: (nodeId: string) => void
  onFork?:() => void
  onLeaf?:() => void
  onStepBack?:() => void
}): void {
  function step(currentNodeId: string): void {
      const nodeIds = getTargetIds({sourceId: currentNodeId, graph})

      onNode?.(currentNodeId)

      // Found a fork
      if (nodeIds.length > 1) {
        onFork?.()
      }

      // Found a leaf
      if (!nodeIds.length) {
        onLeaf?.()
      }

      // Crawl through each fork branch
      for (let i = 0; i < nodeIds.length; i++) {
        const isLastBranch = i === nodeIds.length - 1
        const nodeId = nodeIds[i]
        step(nodeId);

        // This was the last branch of the fork. Step back
        // to previous node.
        if (isLastBranch) {
          onStepBack?.()
        }
      }
  }
  step(sourceId);
}

export function getAllPathsFrom<T>({
  sourceId,
  graph
}: {
  sourceId: string
  graph: Graph<T>
}): string[][] {
  const crawlerState: string[] = []
  const completePaths: string[][] = []

  crawlDepthFirst({
    sourceId,
    graph,
    onNode(nodeId) {
      crawlerState.push(nodeId)
    },
    onLeaf() {
      // The crawler has reached the end of the path.
      // Copy the current path as a new complete path and
      // pop the current path to step back to the previous fork
      completePaths.push([...crawlerState])
      crawlerState.pop()
    },
    onStepBack() {
      crawlerState.pop()
    }
  })

  return completePaths
}

export function getAllPathsTo<T>({
  targetId,
  graph
}: {
  targetId: string
  graph: Graph<T>
}): string[][] {
  const inversedGraph = {
    nodes: graph.nodes,
    edges: graph.edges.map(({target, source}) => ({
      target: source,
      source: target
    }))
  }
  return getAllPathsFrom({
    sourceId: targetId,
    graph: inversedGraph
  }).map(path => path.reverse())
}

/**
 * Return targets of a source
 */
function getTargetIds({
  sourceId,
  graph
}: {
  sourceId: string
  graph: Graph<any>
}): string[] {
  return graph.edges.filter(
    edge => edge.source === sourceId
  ).map(({target}) => target)
}