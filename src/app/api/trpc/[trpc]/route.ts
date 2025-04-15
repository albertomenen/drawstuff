import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest } from 'next/server';

import { appRouter } from '@/server/api/root';
import { createTRPCContext } from '@/trpc/server';

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. from timings, page renders, client requests).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({ headers: req.headers });
};

const handler = async (req: NextRequest) => {
  const clonedReqForLog = req.clone();
  let bodyJson: any = null;
  let path: string | null = null;

  try {
    const url = new URL(req.url);
    path = url.searchParams.get('path') ?? url.pathname.split('/api/trpc/')[1] ?? 'unknown';
    console.log(`--- Handler received request for path (approx): ${path} ---`);

    if (req.headers.get('content-type')?.includes('application/json')) {
        bodyJson = await clonedReqForLog.json();
        console.log("--- PARSED REQUEST BODY in route.ts ---");
        console.log(JSON.stringify(bodyJson, null, 2));
        console.log("--- END PARSED REQUEST BODY ---");
    } else {
        console.log("--- Request body not JSON or empty ---");
    }

  } catch (e) {
    console.error("Error reading/parsing body/path in route.ts:", e);
    try {
        const rawText = await clonedReqForLog.text();
        console.log("--- RAW BODY TEXT on parse error ---");
        console.log(rawText);
        console.log("--- END RAW BODY TEXT ---");
    } catch {}
  }

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed internally on path [${path ?? '<no-path>'}]: ${error.message}`,
            );
          }
        : undefined,
  });
}

export { handler as GET, handler as POST }; 