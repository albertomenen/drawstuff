import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '@/trpc/server';
import { TLStoreSnapshot } from '@tldraw/tlschema';

// Use TLStoreSnapshot for the in-memory store type
let storedDocument: TLStoreSnapshot | null = null;

// *** Simplify the schema drastically for testing ***
const AnyDataSchema = z.any();

export const documentRouter = createTRPCRouter({
  getDocument: publicProcedure
    .query((): TLStoreSnapshot | null => {
      console.log("API: Retrieving document...");
      // Log the structure being returned (use JSON.stringify for clarity)
      console.log("API: Returning stored document:", JSON.stringify(storedDocument, null, 2));
      return storedDocument;
    }),

  saveDocument: publicProcedure
    .input(AnyDataSchema) // Use the extremely lenient schema
    .mutation(({ input }) => {
      console.log("API: Attempting to save document...");
      console.log("API: Received snapshot for saving:", JSON.stringify(input, null, 2));
      try {
          // Basic check if it's somewhat object-like before storing
          if (input && typeof input === 'object') {
              // Log the schemaVersion if it exists, for debugging
              console.log("API: Received schemaVersion (if exists):", (input as any)?.schema?.schemaVersion);
              // Store the received input directly (as TLStoreSnapshot type hint)
              storedDocument = input as TLStoreSnapshot;
              console.log("API: Document saved successfully (with lenient validation).");
              return { success: true };
          } else {
               throw new Error("Received invalid non-object data for saving.");
          }
      } catch (error) {
          console.error("API: Error during save:", error);
          return { success: false, error: "Failed to save document on server. Check server logs." };
      }
    }),
}); 