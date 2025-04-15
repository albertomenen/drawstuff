// src/trpc/server.ts
import { initTRPC } from '@trpc/server';
// import { CreateNextContextOptions } from '@trpc/server/adapters/next'; // <-- Remove this import
// import superjson from 'superjson'; // <-- Temporarily remove superjson

// Define a type for the context based on fetch adapter needs (e.g., Headers)
interface CreateContextOptions {
  headers: Headers;
}

// Context creation - updated signature
export const createTRPCContext = async (opts: CreateContextOptions) => {
  // You can use opts.headers here if needed
  console.log("Creating context with headers:", opts.headers.get('user-agent')); // Example usage
  return {};
};

// Initialize tRPC
const t = initTRPC.context<typeof createTRPCContext>().create({
  // transformer: superjson, // <-- Temporarily remove transformer
  errorFormatter({ shape }) {
    return shape;
  },
});

// Middleware to log input before validation/procedure execution
const loggingMiddleware = t.middleware(async ({ path, type, input, next }) => {
  console.log(`+++ tRPC Middleware Log +++`);
  console.log(`Path: ${path}`);
  console.log(`Type: ${type}`);
  // Log the raw input received by the middleware layer
  console.log(`Input received by middleware:`, input); 
  console.log(`+++++++++++++++++++++++++++`);
  // Continue processing
  return next(); // Pass control to the next middleware or procedure
});

// Base router and procedure helpers
export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
// Apply the middleware to public procedures
export const publicProcedure = t.procedure.use(loggingMiddleware);