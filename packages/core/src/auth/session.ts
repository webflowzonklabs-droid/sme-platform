import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/index";
import { sessions, users, tenantMemberships, roles } from "../db/schema/index";
import { generateToken, hashToken } from "@sme/shared";
import type { AuthMethod, SessionContext } from "@sme/shared";

// ============================================
// Session Management — database-backed sessions
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
 * Create a new session for a user.
 * Returns the raw token (to be set as cookie) and the session record.
 */
export async function createSession(params: {
  userId: string;
  tenantId?: string | null;
  authMethod?: AuthMethod;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateToken(32);
  const tokenHash = await hashToken(token);

  const duration =
    params.authMethod === "pin"
      ? PIN_SESSION_DURATION_MS
      : SESSION_DURATION_MS;

  const expiresAt = new Date(Date.now() + duration);

  const [session] = await db
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

  // Find the session with user data
  const result = await db
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
    },
  };

  // If session has a tenant context, load the membership + role
  if (row.sessionTenantId) {
    const membershipResult = await db
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
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Invalidate all sessions for a user.
 */
export async function invalidateAllUserSessions(
  userId: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Update session's tenant context (for tenant switching).
 */
export async function updateSessionTenant(
  sessionId: string,
  tenantId: string
): Promise<void> {
  await db
    .update(sessions)
    .set({ tenantId })
    .where(eq(sessions.id, sessionId));
}
