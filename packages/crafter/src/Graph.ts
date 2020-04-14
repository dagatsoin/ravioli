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
 */
function crawlDepthFirst({
  sourceId,
  graph,
  onNode,
  onFork,
  onLeaf
}: {
  sourceId: string
  graph: Graph<any>
  onNode(nodeId: string): void
  onFork(): void
  onLeaf(): void
}): void {
  function step(currentNodeId: string): void {
      const nodeIds = getTargetIds({sourceId: currentNodeId, graph})

      onNode(currentNodeId)

      // Found a fork
      if (nodeIds.length > 1) {
        onFork()
      }

      // Found a leaf
      if (!nodeIds.length) {
        onLeaf()
      }

      // Crawl through each fork
      for (const nodeId of nodeIds) {
        step(nodeId);
      }
  }
  step(sourceId);
}

export function getAllPaths<T>({
  sourceId,
  graph
}: {
  sourceId: string
  graph: Graph<T>
}): string[][] {
  const crawlerState: string[][] = [[]]
  const completePaths: string[][] = []

  crawlDepthFirst({
    sourceId,
    graph,
    onNode(nodeId) {
      crawlerState[crawlerState.length - 1].push(nodeId)
    },
    onFork() {
      // The crawler has reached a fork.
      // Backup the current path state at this point.
      // Copy it to create a new path and keep digging.
      const currentPath = crawlerState[crawlerState.length - 1]
      crawlerState.push([...currentPath])
    },
    onLeaf() {
      // The crawler has reached the end of the path.
      // Pop the queue and step back to the previous fork
      completePaths.push(crawlerState.pop()!)
    }
  })

  return completePaths
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

/**
 * @typedef {Object} Callbacks
 *
 * @property {function(vertices: Object): boolean} [allowTraversal] -
 *   Determines whether DFS should traverse from the vertex to its neighbor
 *   (along the edge). By default prohibits visiting the same vertex again.
 *
 * @property {function(vertices: Object)} [enterVertex] - Called when BFS enters the vertex.
 *
 * @property {function(vertices: Object)} [leaveVertex] - Called when BFS leaves the vertex.
 */

/**
 * @param {Callbacks} [callbacks]
 * @returns {Callbacks}
 */
function initCallbacks(callbacks = {}) {
  const initiatedCallback = callbacks;

  const stubCallback = () => {};

  const allowTraversalCallback = (
    () => {
      const seen = {};
      return ({ nextVertex }) => {
        if (!seen[nextVertex.getKey()]) {
          seen[nextVertex.getKey()] = true;
          return true;
        }
        return false;
      };
    }
  )();

  initiatedCallback.allowTraversal = callbacks.allowTraversal || allowTraversalCallback;
  initiatedCallback.enterVertex = callbacks.enterVertex || stubCallback;
  initiatedCallback.leaveVertex = callbacks.leaveVertex || stubCallback;

  return initiatedCallback;
}

/**
 * @param {Graph} graph
 * @param {GraphVertex} startVertex
 * @param {Callbacks} [originalCallbacks]
 */
export default function breadthFirstSearch(graph, startVertex, originalCallbacks) {
  const callbacks = initCallbacks(originalCallbacks);
  const vertexQueue = new Queue();

  // Do initial queue setup.
  vertexQueue.enqueue(startVertex);

  let previousVertex = null;

  // Traverse all vertices from the queue.
  while (!vertexQueue.isEmpty()) {
    const currentVertex = vertexQueue.dequeue();
    callbacks.enterVertex({ currentVertex, previousVertex });

    // Add all neighbors to the queue for future traversals.
    graph.getNeighbors(currentVertex).forEach((nextVertex) => {
      if (callbacks.allowTraversal({ previousVertex, currentVertex, nextVertex })) {
        vertexQueue.enqueue(nextVertex);
      }
    });

    callbacks.leaveVertex({ currentVertex, previousVertex });

    // Memorize current vertex before next loop.
    previousVertex = currentVertex;
  }
}