/**
 * GraphQL Schema - Request-Scoped Counter
 *
 * Same schema as singleton version, but:
 * - Counter is loaded from DB per request
 * - Mutations trigger NAP which persists automatically
 */

export const typeDefs = `#graphql
  """
  Counter Representation
  """
  type CounterRepresentation {
    "Counter ID (multi-tenant)"
    id: String!

    "Current count value"
    count: Int!

    "Active control states"
    controlStates: [String!]!

    "SAM step ID for this request"
    step: Int!
  }

  """
  Result of decrement mutation
  """
  type DecrementResult {
    success: Boolean!
    error: String
    representation: CounterRepresentation!
  }

  """
  Debug info showing persistence
  """
  type DebugInfo {
    counterId: String!
    currentCount: Int!
    saveLogCount: Int!
    allCounters: [CounterRecord!]!
  }

  type CounterRecord {
    id: String!
    count: Int!
    updatedAt: String!
  }

  type Query {
    """
    Get counter for current request context
    Counter ID is determined by X-Counter-Id header
    """
    counter: CounterRepresentation!

    """
    Debug endpoint to see persistence state
    """
    debug: DebugInfo!
  }

  type Mutation {
    "Increment counter (persists via NAP)"
    increment: CounterRepresentation!

    "Decrement counter (gated, persists via NAP)"
    decrement: DecrementResult!

    "Reset counter (persists via NAP)"
    reset: CounterRepresentation!

    "Add amount (persists via NAP)"
    addAmount(amount: Int!): CounterRepresentation!
  }
`;
