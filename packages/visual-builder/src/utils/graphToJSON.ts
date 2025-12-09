/**
 * Graph to JSON Converter
 * Converts the visual node graph into a valid ContainerConfig JSON
 */

import type { ContainerConfig } from '@warfog/ravioli';
import { RavioliNode, RavioliEdge, AcceptorNodeData, ActionNodeData, PredicateNodeData, StepReactionNodeData } from '../types/node.types';

export interface ExportResult {
  success: boolean;
  config?: ContainerConfig;
  errors: string[];
  warnings: string[];
}

/**
 * Convert the node graph to ContainerConfig JSON
 */
export function graphToContainerConfig(
  nodes: RavioliNode[],
  edges: RavioliEdge[]
): ExportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find container node
  const containerNode = nodes.find(n => n.data.type === 'container');
  if (!containerNode) {
    return {
      success: false,
      errors: ['No container node found. A container node is required.'],
      warnings: []
    };
  }

  // Get all edges connected to the container
  const connectedEdges = edges.filter(e => e.target === containerNode.id);

  if (connectedEdges.length === 0) {
    warnings.push('No components connected to container. The configuration will be empty.');
  }

  // Build ContainerConfig
  const config: ContainerConfig = {};

  // Process Acceptors
  const acceptorEdges = connectedEdges.filter(e => e.targetHandle === 'acceptors');
  if (acceptorEdges.length > 0) {
    config.acceptors = {};
    acceptorEdges.forEach(edge => {
      const node = nodes.find(n => n.id === edge.source);
      if (node && node.data.type === 'acceptor') {
        const data = node.data as AcceptorNodeData;
        config.acceptors![data.mappedName] = data.assetId;
      }
    });
  }

  // Process Control State Predicates
  const predicateEdges = connectedEdges.filter(e => e.targetHandle === 'controlStatePredicates');
  if (predicateEdges.length > 0) {
    config.controlStatePredicates = {};
    predicateEdges.forEach(edge => {
      const node = nodes.find(n => n.id === edge.source);
      if (node && node.data.type === 'predicate') {
        const data = node.data as PredicateNodeData;
        config.controlStatePredicates![data.mappedName] = data.assetId;
      }
    });
  }

  // Process Actions
  const actionEdges = connectedEdges.filter(e => e.targetHandle === 'actions');
  if (actionEdges.length > 0) {
    config.actions = {};
    actionEdges.forEach(edge => {
      const node = nodes.find(n => n.id === edge.source);
      if (node && node.data.type === 'action') {
        const data = node.data as ActionNodeData;
        config.actions![data.mappedName] = data.assetId;

        // Validate that required acceptors are present
        const missingAcceptors = data.produces.filter(
          mutation => !config.acceptors || !Object.values(config.acceptors).includes(mutation)
        );

        if (missingAcceptors.length > 0) {
          warnings.push(
            `Action "${data.actionName}" produces mutations [${missingAcceptors.join(', ')}] ` +
            `but corresponding acceptors are not connected. ` +
            `This may cause the action to fail at runtime.`
          );
        }
      }
    });
  }

  // Process Step Reactions
  const reactionEdges = connectedEdges.filter(e => e.targetHandle === 'stepReactions');
  if (reactionEdges.length > 0) {
    // Get all reaction nodes and sort by order
    const reactionNodes = reactionEdges
      .map(edge => nodes.find(n => n.id === edge.source))
      .filter((node): node is RavioliNode => !!node && node.data.type === 'stepReaction')
      .sort((a, b) => {
        const aData = a.data as StepReactionNodeData;
        const bData = b.data as StepReactionNodeData;
        return aData.order - bData.order;
      });

    config.stepReactions = reactionNodes.map(node => {
      const data = node.data as StepReactionNodeData;
      return data.assetId;
    });
  }

  // Validation: Warn if container is empty
  const isEmpty = !config.acceptors && !config.actions && !config.controlStatePredicates && !config.stepReactions;
  if (isEmpty) {
    warnings.push('Container configuration is empty. Consider connecting some components.');
  }

  return {
    success: errors.length === 0,
    config,
    errors,
    warnings
  };
}

/**
 * Helper to get connected nodes for a specific handle
 */
export function getConnectedNodes(
  targetNodeId: string,
  handle: string,
  allNodes: RavioliNode[],
  edges: RavioliEdge[]
): RavioliNode[] {
  const connectedEdges = edges.filter(
    e => e.target === targetNodeId && e.targetHandle === handle
  );
  const sourceNodeIds = connectedEdges.map(e => e.source);
  return allNodes.filter(n => sourceNodeIds.includes(n.id));
}

/**
 * Validate node connections
 */
export function validateGraph(nodes: RavioliNode[], edges: RavioliEdge[]): string[] {
  const issues: string[] = [];

  // Check for container node
  const hasContainer = nodes.some(n => n.data.type === 'container');
  if (!hasContainer) {
    issues.push('Missing container node');
  }

  // Check for orphaned nodes (not connected to anything)
  const connectedNodeIds = new Set([
    ...edges.map(e => e.source),
    ...edges.map(e => e.target)
  ]);

  const orphanedNodes = nodes.filter(n => {
    if (n.data.type === 'container') return false; // Container can be alone
    return !connectedNodeIds.has(n.id);
  });

  if (orphanedNodes.length > 0) {
    issues.push(
      `${orphanedNodes.length} orphaned node(s) not connected: ` +
      orphanedNodes.map(n => n.data.label).join(', ')
    );
  }

  return issues;
}
