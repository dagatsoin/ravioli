/**
 * GraphQL Server - Apollo Server with Subscriptions
 *
 * SAM Pattern Placement:
 * - Entry point for GraphQL operations
 * - HTTP for queries/mutations
 * - WebSocket for subscriptions (real-time representation updates)
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import cors from 'cors';
import http from 'http';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';

const PORT = 4000;

async function startServer() {
  // Create Express app and HTTP server
  const app = express();
  const httpServer = http.createServer(app);

  // Create executable schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Set up WebSocket server with graphql-ws
  const serverCleanup = useServer({ schema }, wsServer);

  // Create Apollo Server
  const server = new ApolloServer({
    schema,
    plugins: [
      // Proper shutdown for HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // Start Apollo Server
  await server.start();

  // Apply middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server)
  );

  // Start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║        Counter GraphQL Server (SAM Pattern + Ravioli)     ║
╠═══════════════════════════════════════════════════════════╣
║  GraphQL:      http://localhost:${PORT}/graphql               ║
║  WebSocket:    ws://localhost:${PORT}/graphql                 ║
║                                                           ║
║  SAM Mapping:                                             ║
║    Query    → Get Representation                          ║
║    Mutation → Execute Action                              ║
║    Subscription → Real-time Representation (NAP)          ║
║                                                           ║
║  Try in Apollo Sandbox:                                   ║
║    query { counter { count controlStates step } }         ║
║    mutation { increment { count controlStates } }         ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(console.error);
