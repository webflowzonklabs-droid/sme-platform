import { eq, and, gt } from "drizzle-orm";
import { adminDb } from "../db/index";
import { sessions, users, tenantMemberships, roles } from "../db/schema/index";
import { hashToken } from "@sme/shared";
import type { AuthMethod } from "@sme/shared";
import crypto from "crypto";

// ============================================
// Session Management — database-backed sessions
// ============================================
// All session operations use `adminDb` (superuser connection) because:
// 1. Session validation happens before tenant context is established
// 2. It needs to join users + memberships across tenants
// 3. The `sessions` table has no RLS, but `tenant_memberships` does
// ============================================

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for password auth
const PIN_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours for PIN auth

export interface SessionValidationResult {
  session: {
    id: string;
    userId: string;
    tenantId: string | null;
    authMethod: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
  };
  membership?: {
    id: string;
    roleId: string;
    roleName: string;
    roleSlug: string;
    permissions: string[];
  };
}

/**
 * Generate a cryptographically secure session token.
 * Uses crypto.randomBytes(32) for 256-bit entropy (not UUID).
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a new session for a user.
 * Returns the raw token (to be set as httpOnly cookie) and the session record.
 */
export async function createSession(params: {
  userId: string;
  tenantId?: string | null;
  authMethod?: AuthMethod;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  // Use crypto.randomBytes for session tokens (not UUID)
  const token = generateSecureToken();
  const tokenHash = await hashToken(token);

  const duration =
    params.authMethod === "pin"
      ? PIN_SESSION_DURATION_MS
      : SESSION_DURATION_MS;

  const expiresAt = new Date(Date.now() + duration);

  const [session] = await adminDb
    .insert(sessions)
    .values({
      userId: params.userId,
      tenantId: params.tenantId ?? null,
      tokenHash,
      authMethod: params.authMethod ?? "password",
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!session) {
    throw new Error("Failed to create session");
  }

  return { token, sessionId: session.id, expiresAt };
}

/**
 * Validate a session token.
 * Returns user + membership data if valid, null if expired/invalid.
 */
export async function validateSession(
  token: string
): Promise<SessionValidationResult | null> {
  const tokenHash = await hashToken(token);

  // Find the session with user data (uses adminDb to bypass RLS on memberships)
  const result = await adminDb
    .select({
      sessionId: sessions.id,
      sessionUserId: sessions.userId,
      sessionTenantId: sessions.tenantId,
      sessionAuthMethod: sessions.authMethod,
      sessionExpiresAt: sessions.expiresAt,
      userId: users.id,
      userEmail: users.email,
      userFullName: users.fullName,
      userAvatarUrl: users.avatarUrl,
      userIsActive: users.isActive,
      userIsSuperAdmin: users.isSuperAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  const row = result[0];
  if (!row || !row.userIsActive) return null;

  const validationResult: SessionValidationResult = {
    session: {
      id: row.sessionId,
      userId: row.sessionUserId,
      tenantId: row.sessionTenantId,
      authMethod: row.sessionAuthMethod,
      expiresAt: row.sessionExpiresAt,
    },
    user: {
      id: row.userId,
      email: row.userEmail,
      fullName: row.userFullName,
      avatarUrl: row.userAvatarUrl,
      isSuperAdmin: row.userIsSuperAdmin,
    },
  };

  // If session has a tenant context, load the membership + role
  if (row.sessionTenantId) {
    const membershipResult = await adminDb
      .select({
        membershipId: tenantMemberships.id,
        roleId: roles.id,
        roleName: roles.name,
        roleSlug: roles.slug,
        permissions: roles.permissions,
        isActive: tenantMemberships.isActive,
      })
      .from(tenantMemberships)
      .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
      .where(
        and(
          eq(tenantMemberships.userId, row.sessionUserId),
          eq(tenantMemberships.tenantId, row.sessionTenantId)
        )
      )
      .limit(1);

    const membership = membershipResult[0];
    if (membership && membership.isActive) {
      validationResult.membership = {
        id: membership.membershipId,
        roleId: membership.roleId,
        roleName: membership.roleName,
        roleSlug: membership.roleSlug,
        permissions: membership.permissions ?? [],
      };
    }
  }

  return validationResult;
}

/**
 * Invalidate (delete) a specific session.
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  await adminDb.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Invalidate all sessions for a user.
 */
export async function invalidateAllUserSessions(
  userId: string
): Promise<void> {
  await adminDb.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Update session's tenant context (for tenant switching).
 */
export async function updateSessionTenant(
  sessionId: string,
  tenantId: string
): Promise<void> {
  await adminDb
    .update(sessions)
    .set({ tenantId })
    .where(eq(sessions.id, sessionId));
}

/**
 * Clean up expired sessions.
 * Should be called periodically (cron, scheduled job).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const { sql } = await import("drizzle-orm");
  const result = await adminDb
    .delete(sessions)
    .where(sql`${sessions.expiresAt} < NOW()`)
    .returning({ id: sessions.id });
  return result.length;
}
