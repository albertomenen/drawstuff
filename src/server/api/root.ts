// src/server/api/root.ts
import { createTRPCRouter, publicProcedure } from '@/trpc/server'; 
import { documentRouter } from "@/server/api/routers/document"; // Uncommented and corrected path if needed
import { aiRouter } from "@/server/api/routers/ai"; // Import the new router

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  document: documentRouter, // Added the document router
  ai: aiRouter, // Add the AI router
  health: publicProcedure.query(() => 'ok'), // Simple health check endpoint
});

// Export type definition of API
export type AppRouter = typeof appRouter; 