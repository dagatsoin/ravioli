export type Graph<T, M = {}> = {
  nodes: Node<T>[];
  edges: Edge<M>[];
};

export type WeightedGraph<T> = Graph<T, {weight: number}>

export type Node<T> = T

export type Edge<M = {}> = {
  source: string
  target: string
  metadata?: M
}

/**
 * Return the shortest path in a weighted graph.
 * @param graph 
 * @param startId 
 * @param goalId 
 */
export function dijkstra(graph: WeightedGraph<any>, startId: string, goalId: string) {
  // The cost of each node from the start
  // The start node costs 0
  // All the other node cost infinity for now
  const nodeCosts = {};
  for (const node of graph.nodes) {
    nodeCosts[node.id] = {
      cost: Infinity,
      from: undefined
    };
  }
  nodeCosts[startId] = {
    cost: 0,
    from: startId
  };
  // The visited nodes.
  const visitedNodes = [startId];
  // Unvisited nodes.
  const unvisitedNodes = graph.nodes
    .filter(({ id }) => id !== startId)
    .map(({ id }) => id);

  /**
   * Set the cost of the node if it is lower
   */
  function setCostIfLower(nodeId: string, fromNodeId: string, cost: number) {
    if (cost < nodeCosts[nodeId].cost) {
      nodeCosts[nodeId] = {
        cost,
        from: fromNodeId
      };
    }
  }

  function getUnvisitedNeighbours(nodeId: string) {
    return getNeighbours(nodeId).filter(target =>
      unvisitedNodes.includes(target)
    );
  }

  function getNeighbours(nodeId: string) {
    return getEdgesOf(nodeId, graph).map(({ target }) => target);
  }

  function getEdgeCost(sourceId: string, targetId: string) {
    return graph.edges.find(
      ({ source: s, target: t }) => s === sourceId && t === targetId
    )?.metadata?.weight || Infinity;
  }

  function computeNeighboursCost(nodeId: string) {
    // Update cost to all neighbours.
    getNeighbours(nodeId).forEach(id => {
      const edgeCost = getEdgeCost(nodeId, id);
      // Cost equals to the cost of the current node plus the cost of the edge
      // to the neighbourg
      setCostIfLower(id, nodeId, nodeCosts[nodeId].cost + edgeCost);
    });
  }

  const path = [startId];

  // From the start
  function step(currentNodeId: string) {
    computeNeighboursCost(currentNodeId);

    // Visite each unvisited neighbour and computed their neighbours tentative distance
    getUnvisitedNeighbours(currentNodeId)
      .sort((a, b) => nodeCosts[a].cost - nodeCosts[b].cost)
      .forEach(nodeId => {
        computeNeighboursCost(nodeId);
        // Mark the node as visited
        visitedNodes.push(nodeId);
        unvisitedNodes.splice(unvisitedNodes.indexOf(nodeId), 1);
      });
    if (visitedNodes.includes(goalId)) {
      path.push(currentNodeId);
      path.push(goalId);
    } else {
      // From there, we need to choose from the new visited node, which one to pick
      // We look up on the unvisited node with the lowest tentative value.
      // Then we look up the node which this cost comes from.
      const nextNodeId = unvisitedNodes
        .filter(nodeId => nodeCosts[nodeId].cost !== Infinity)
        .reduce(function(lowest, neighbourId) {
          return nodeCosts[lowest]?.cost < nodeCosts[neighbourId].cost
            ? lowest
            : neighbourId;
        }, undefined);

      path.push(nodeCosts[nextNodeId].from);
      visitedNodes.push(nextNodeId);
      unvisitedNodes.splice(unvisitedNodes.indexOf(nextNodeId), 1);
      // console.log(`Next node is now be ${nextNodeId}`);
      step(nextNodeId);
    }
  }

  step(startId);
  
  return path
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
 * Called on each step.
 * Return true to stop the crawl.
 *
 * onFork(): void
 * Called each time the crawler reaches a fork.
 * Return true to stop the crawl.
 *
 * onLeaf(): void
 * Called each time the crawler reaches a leaf.
 *
 * onStepBack(): void
 * Called when the crawler step back to the previous node.
 */
function crawlDepthFirst<T>({
  fromId,
  graph,
  onNode,
  onFork,
  onLeaf,
  onStepBack,
  stopCrawlThisBranch
}: {
  fromId: string
  graph: Graph<T>
  onNode?: (nodeId: string) => boolean | void
  onFork?:(nodeId: string) => boolean
  onLeaf?:(nodeId: string) => void
  onStepBack?:(nodeId: string) => void,
  stopCrawlThisBranch?:(nodeId: string) => boolean
}): void {
  // Track visited to prevent circular deps
  const visited: string[] = [];

  /**
   * If return true: stop the graph crawl
   * If return false | undefined: stop crawling the current branch.
   */
  function step(currentNodeId: string): boolean {
    let stop: boolean 
    if (!currentNodeId) {
      throw new Error(`[GRAPH] crawlDepthFirst Unknown node with id ${currentNodeId}`)
    }
   
    // Node is already visited, skip.
    if (
      visited.includes(currentNodeId) ||
      (stopCrawlThisBranch && stopCrawlThisBranch(currentNodeId))
    ) {
      return false; // will stop crawling this branch
    }
    visited.push(currentNodeId);

    const sourceIds = getSourceIds(currentNodeId, graph);

    stop = !!onNode?.(currentNodeId);

    if (stop) {
      return true; // will stop the graph crawl
    }

    // Found a fork
    if (sourceIds.length > 1) {
      onFork && onFork(currentNodeId);
    }

    // Found a leaf
    if (!sourceIds.length) {
      onLeaf && onLeaf(currentNodeId);
    }

    // Crawl through each fork branch
    for (let i = 0; i < sourceIds.length; i++) {
      const isLastBranch = i === sourceIds.length - 1;
      stop = step(sourceIds[i]);

      // Stop the recursion
      if (stop) {
        return true;
      }

      // This was the last branch of the fork. Step back
      // to previous node.
      if (isLastBranch) {
        onStepBack && onStepBack(currentNodeId);
      }
    }
    return false
  }
  step(fromId);
}

/**
 * Search a node in the graph which matchs the given predicate
 * by using a depth first crawler, starting from the given fromId node.
 * Return undefined if not found.
 * @param graph 
 * @param targetId 
 */
export function searchDFS(graph: Graph<any>, predicate: (nodeId: string) => boolean, fromId: string): string | undefined {
  let result: string | undefined
  crawlDepthFirst({
    graph,
    fromId,
    onNode(nodeId) {
      if (predicate(nodeId)) {
        result = nodeId
        return true  
      }
      return false
    } 
  });
  return result
}

/**
 * Sort the graph in a topological order. Starting from the first
 * target id of the edge list.
 */
export function topologicalSort(graph: Graph<any>, idField: string) {
  const stack: string[] = []
  const visited: string[] = []

  while (stack.length < graph.nodes.length) {
    const fromId = graph.edges.find(({ target }) => !stack.includes(target))?.target;
    if (fromId === undefined) {
      // All linked nodes has been visited. Found some isolated nodes. Add it at the end of the stack.
      const isolated = graph.nodes.filter(({id}) => !visited.includes(id)).map(({id}) => id)
      stack.push(...isolated)
      break
    }
    crawlDepthFirst({
      graph,
      fromId,
      stopCrawlThisBranch: nodeId => {
        const isVisited = visited.includes(nodeId);
        if (!isVisited) {
          visited.push(nodeId);
        }
        return isVisited;
      },
      onLeaf: nodeId => {
        if (!stack.includes(nodeId)) {
          stack.push(nodeId);
        }
      },
      onStepBack: nodeId => {
        if (!stack.includes(nodeId)) {
          stack.push(nodeId);
        }
      }
    });
  }
  return stack;
}

/**
 * Return source ids of a target
 */
function getSourceIds(targetId: string, graph: Graph<any>) {
  return graph.edges
    .filter(edge => edge.target === targetId)
    .map(({ source }) => source);
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
    fromId: sourceId,
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