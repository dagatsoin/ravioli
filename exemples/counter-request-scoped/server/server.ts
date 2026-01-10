/**
 * GraphQL Server - Singleton Counter with NAP Persistence
 *
 * Architecture:
 * - Singleton container per tenant (lives for server lifetime)
 * - Hydrates data from DB on first access
 * - NAP (Step Reaction) automatically persists after each step
 *
 * TEMPORAL LOGIC PRESERVED:
 * - Step count increments continuously: 0 → 1 → 2 → 3 → ...
 * - Same container used across all requests for same tenant
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { createContext } from './context.js';

const PORT = 4001;

async function startServer() {
  const app = express();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: createContext,
    })
  );

  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║      Counter GraphQL Server (Singleton + NAP Persistence)     ║
╠═══════════════════════════════════════════════════════════════╣
║  GraphQL:  http://localhost:${PORT}/graphql                       ║
║                                                               ║
║  Singleton Architecture (TEMPORAL LOGIC PRESERVED):          ║
║    1. One container per tenant (lives for server lifetime)   ║
║    2. Data hydrated from DB on first access                  ║
║    3. NAP (Step Reaction) persists after each step           ║
║    4. Step count: 0 → 1 → 2 → 3 → ... (continuous!)          ║
║                                                               ║
║  Multi-tenant via X-Counter-Id header:                        ║
║    curl -H "X-Counter-Id: user123" ...                        ║
║                                                               ║
║  Try:                                                         ║
║    mutation { increment { id count step } }                   ║
║    query { debug { allCounters { id count } } }               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);
