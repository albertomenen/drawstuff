import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/trpc/server';
import { TLStoreSnapshot } from '@tldraw/tlschema';

// Use TLStoreSnapshot for the in-memory store type
let storedDocument: TLStoreSnapshot | null = null;

// Refine the schema to specifically require the schema object with schemaVersion
const StoreSnapshotSchema = z.object({
	store: z.record(z.any()),
	schema: z.object({
		schemaVersion: z.number(), // Explicitly require schemaVersion
		storeVersion: z.number(), // Expect storeVersion as well
		// Add other known properties if needed for stricter validation
		recordVersions: z.record(z.object({ version: z.number() })).passthrough(), // Example
	}).passthrough(), // Allow other properties on schema object
}).passthrough(); // Allow other top-level properties if needed

export const documentRouter = createTRPCRouter({
  getDocument: publicProcedure
    .query((): TLStoreSnapshot | null => {
      console.log("API: Retrieving document...");
      // Log the structure being returned (use JSON.stringify for clarity)
      console.log("API: Returning stored document:", JSON.stringify(storedDocument, null, 2));
      return storedDocument;
    }),

  saveDocument: publicProcedure
    .input(StoreSnapshotSchema) // Use the more specific schema
    .mutation(({ input }) => {
      console.log("API: Attempting to save document...");
      // Log the input structure before storing
      console.log("API: Received snapshot for saving:", JSON.stringify(input, null, 2));
      try {
          // Although tRPC validates input, parse again just to be sure & catch potential issues
          const validatedInput = StoreSnapshotSchema.parse(input);
          storedDocument = validatedInput; // Store the validated input
          console.log("API: Document saved successfully.");
          return { success: true };
      } catch (error) {
          console.error("API: Validation failed during save:", error);
          // Improve error feedback slightly
          return { success: false, error: "Validation failed during save. Check server logs." };
      }
    }),
}); 