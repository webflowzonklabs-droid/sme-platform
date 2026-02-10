import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@sme/core/trpc";
import { validateSession } from "@sme/core/auth";
import { cookies } from "next/headers";

// Import core to trigger module registration side effects
import "@sme/core";

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      // Read session token from cookie
      const cookieStore = await cookies();
      const sessionToken = cookieStore.get("session_token")?.value;

      let session = null;
      if (sessionToken) {
        session = await validateSession(sessionToken);
      }

      // Extract IP and user agent
      const ipAddress =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        undefined;
      const userAgent = req.headers.get("user-agent") ?? undefined;

      // Extract CSRF/source header for CSRF protection
      const trpcSource = req.headers.get("x-trpc-source") ?? undefined;

      return createContext({ session, ipAddress, userAgent, trpcSource });
    },
    onError({ error, path }) {
      console.error(`❌ tRPC error on '${path}':`, error.message);
    },
  });
};

export { handler as GET, handler as POST };
