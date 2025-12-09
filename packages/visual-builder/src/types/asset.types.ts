/**
 * Asset Store Schema
 * Defines the structure for storing reusable Ravioli components
 */

export interface AssetLibrary {
  version: "1.0";
  metadata: {
    name: string;
    description?: string;
    author?: string;
    created?: string; // ISO 8601 date
  };
  acceptors: AcceptorAsset[];
  actions: ActionAsset[];
  controlStatePredicates: PredicateAsset[];
  stepReactions: StepReactionAsset[];
}

export interface BaseAsset {
  id: string;              // Unique identifier (registry key)
  name: string;            // Display name
  description?: string;    // Tooltip/help text
  category?: string;       // For organizing in panels
  tags?: string[];         // Searchable keywords
}

export interface AcceptorAsset extends BaseAsset {
  type: "acceptor";
  mutationName: string;    // The mutation type string
  payloadSchema?: {        // JSON Schema for payload
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  hasCondition: boolean;   // Whether it has validation logic
}

export interface ActionAsset extends BaseAsset {
  type: "action";
  parameters?: {           // Action function parameters
    name: string;
    type: string;          // "string" | "number" | "boolean" | "object"
    required: boolean;
    default?: any;
  }[];
  produces: string[];      // Array of mutation names this action creates
}

export interface PredicateAsset extends BaseAsset {
  type: "predicate";
  stateName: string;       // Control state name (e.g., "IS_ALIVE")
}

export interface StepReactionAsset extends BaseAsset {
  type: "stepReaction";
  hasCondition: boolean;   // Whether it has a 'when' predicate
  triggers?: string[];     // Mutations that typically trigger this
}

export type Asset = AcceptorAsset | ActionAsset | PredicateAsset | StepReactionAsset;
