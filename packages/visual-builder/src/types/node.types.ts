import { Node, Edge } from 'reactflow';

export type NodeType = 'container' | 'acceptor' | 'action' | 'predicate' | 'stepReaction';

export interface BaseNodeData {
  label: string;
  assetId: string;      // References asset library
  description?: string;
  category?: string;
}

export interface ContainerNodeData extends BaseNodeData {
  type: 'container';
  containerName: string;
}

export interface AcceptorNodeData extends BaseNodeData {
  type: 'acceptor';
  mutationName: string;
  mappedName: string;   // Key in ContainerConfig.acceptors
  payloadSchema?: any;
}

export interface ActionNodeData extends BaseNodeData {
  type: 'action';
  actionName: string;
  mappedName: string;   // Key in ContainerConfig.actions
  produces: string[];
}

export interface PredicateNodeData extends BaseNodeData {
  type: 'predicate';
  stateName: string;
  mappedName: string;   // Key in ContainerConfig.controlStatePredicates
}

export interface StepReactionNodeData extends BaseNodeData {
  type: 'stepReaction';
  order: number;        // Position in stepReactions array
}

export type NodeData =
  | ContainerNodeData
  | AcceptorNodeData
  | ActionNodeData
  | PredicateNodeData
  | StepReactionNodeData;

export type RavioliNode = Node<NodeData>;
export type RavioliEdge = Edge;
