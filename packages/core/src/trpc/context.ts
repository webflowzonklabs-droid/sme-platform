import type { SessionValidationResult } from "../auth/session";
import type { Database } from "../db/index";
import { db } from "../db/index";

// ============================================
// tRPC Context — created per-request
// ============================================

export interface Context {
  /** Session data (null if not authenticated) */
  session: SessionValidationResult | null;
  /** Database connection (single pool, no RLS) */
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
 */
export function createContext(params: {
  session: SessionValidationResult | null;
  ipAddress?: string;
  userAgent?: string;
  trpcSource?: string;
}): Context {
  return {
    session: params.session,
    db,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    trpcSource: params.trpcSource,
  };
}
