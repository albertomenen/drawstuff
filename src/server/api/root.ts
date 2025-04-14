// src/server/api/root.ts
import { createTRPCRouter, publicProcedure } from '@/trpc/server'; 
import { documentRouter } from "@/server/api/routers/document"; // Uncommented and corrected path if needed

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  document: documentRouter, // Added the document router
  health: publicProcedure.query(() => 'ok'), // Simple health check endpoint
});

// Export type definition of API
export type AppRouter = typeof appRouter; 