/**
 * GraphQL Schema - Representation Contract
 *
 * SAM Pattern Placement:
 * - The schema DEFINES what clients can see (Representation)
 * - Types are the shape of the Representation
 * - Queries return Representation
 * - Mutations ARE Actions
 * - Subscriptions push Representation updates (NAP)
 */

export const typeDefs = `#graphql
  """
  The Representation - what clients see of the Model
  This is the ONLY view of the counter state
  """
  type CounterRepresentation {
    "Current count value"
    count: Int!

    "Active control states (e.g., CAN_DECREMENT, IS_ZERO)"
    controlStates: [String!]!

    "SAM step ID - increments with each state change"
    step: Int!
  }

  """
  Result of decrement mutation - can fail if not allowed
  """
  type DecrementResult {
    "Whether the action succeeded"
    success: Boolean!

    "Error message if action was rejected"
    error: String

    "Current representation (even on failure)"
    representation: CounterRepresentation!
  }

  """
  Queries - Read the Representation
  """
  type Query {
    "Get current counter representation"
    counter: CounterRepresentation!
  }

  """
  Mutations - Actions that propose changes to the Model
  Each mutation returns the new Representation
  """
  type Mutation {
    "Increment counter by 1"
    increment: CounterRepresentation!

    "Decrement counter by 1 (gated by CAN_DECREMENT control state)"
    decrement: DecrementResult!

    "Reset counter to 0"
    reset: CounterRepresentation!

    "Add arbitrary amount to counter"
    add(amount: Int!): CounterRepresentation!
  }

  """
  Subscriptions - Real-time Representation updates
  This implements the NAP (Next-Action-Predicate) push mechanism
  """
  type Subscription {
    "Receive representation updates when counter changes"
    counterUpdated: CounterRepresentation!
  }
`;
