// src/trpc/server.ts
import { initTRPC } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';
import superjson from 'superjson'; // Recommended for serialization

// Context creation
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  // You can add context here if needed (e.g., database connection, session)
  return {};
};

// Initialize tRPC
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson, // Use superjson for data transformation
  errorFormatter({ shape }) {
    return shape;
  },
});

// Base router and procedure helpers
export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;