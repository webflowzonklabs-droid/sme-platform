import type { SessionValidationResult } from "../auth/session";

// ============================================
// tRPC Context — created per-request
// ============================================

export interface Context {
  /** Session data (null if not authenticated) */
  session: SessionValidationResult | null;
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
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    trpcSource: params.trpcSource,
  };
}
