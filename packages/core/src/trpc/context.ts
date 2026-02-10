import type { SessionValidationResult } from "../auth/session";
import type { Database } from "../db/index";
import { adminDb } from "../db/index";

// ============================================
// tRPC Context — created per-request
// ============================================

export interface Context {
  /** Session data (null if not authenticated) */
  session: SessionValidationResult | null;
  /** Database connection for this request.
   *  - Default: adminDb (superuser, for auth/admin operations)
   *  - Tenant procedures: overridden with RLS-enforced transaction
   */
  db: Database;
  /** Client IP address */
  ipAddress?: string;
  /** Client user agent */
  userAgent?: string;
  /** X-TRPC-Source header for CSRF protection */
  trpcSource?: string;
}

/**
 * Create the tRPC context for a request.
 * Called by the tRPC handler in the Next.js app.
 */
export function createContext(params: {
  session: SessionValidationResult | null;
  ipAddress?: string;
  userAgent?: string;
  trpcSource?: string;
}): Context {
  return {
    session: params.session,
    db: adminDb, // Default to admin connection (auth, session, admin ops)
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    trpcSource: params.trpcSource,
  };
}
