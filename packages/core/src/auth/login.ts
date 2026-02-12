import { eq, and } from "drizzle-orm";
import { adminDb } from "../db/index";
import { users, tenantMemberships, tenants, roles } from "../db/schema/index";
import { verifyPassword, hashPassword } from "./password";
import { createSession } from "./session";
import { createAuditLog } from "../audit/index";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "@sme/shared";

// ============================================
// Auth Logic — extracted for use by API routes
// These functions return raw tokens for the caller
// to set as httpOnly cookies. NEVER return tokens to clients.
// ============================================

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LoginResult {
  token: string;
  user: { id: string; email: string; fullName: string };
  tenantId: string | null;
  hasMultipleTenants: boolean;
  isSuperAdmin: boolean;
  expiresAt: Date;
}

export interface RegisterResult {
  token: string;
  user: { id: string; email: string; fullName: string };
  expiresAt: Date;
}

export interface RegisterWithTenantResult {
  token: string;
  user: { id: string; email: string; fullName: string };
  tenant: { id: string; name: string; slug: string };
  expiresAt: Date;
}

/**
 * Authenticate a user with email + password.
 * Includes rate limiting (max 10 failed attempts per 15 min).
 * Returns the raw token for the caller to set as httpOnly cookie.
 */
export async function loginWithPassword(params: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<LoginResult> {
  const { email, password, ipAddress, userAgent } = params;

  // Find user
  const [user] = await adminDb
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.isActive) {
    throw new AuthError("Invalid email or password", 401);
  }

  // Check login lockout
  if (
    user.loginLockedUntil &&
    new Date() < new Date(user.loginLockedUntil)
  ) {
    throw new AuthError(
      "Too many failed login attempts. Please try again later.",
      429
    );
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    const newAttempts = (user.loginFailedAttempts ?? 0) + 1;
    const updateData: Record<string, unknown> = {
      loginFailedAttempts: newAttempts,
    };

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.loginLockedUntil = new Date(
        Date.now() + LOGIN_LOCKOUT_DURATION_MS
      );
    }

    await adminDb
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id));

    throw new AuthError("Invalid email or password", 401);
  }

  // Reset failed attempts on successful login
  if (user.loginFailedAttempts > 0 || user.loginLockedUntil) {
    await adminDb
      .update(users)
      .set({ loginFailedAttempts: 0, loginLockedUntil: null })
      .where(eq(users.id, user.id));
  }

  // Check memberships
  const memberships = await adminDb
    .select({ tenantId: tenantMemberships.tenantId })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, user.id),
        eq(tenantMemberships.isActive, true)
      )
    );

  // Auto-select tenant if user has exactly one — but NOT for super admins,
  // who need to see the select-tenant page with Platform Admin access
  const tenantId =
    memberships.length === 1 && !user.isSuperAdmin ? memberships[0]!.tenantId : null;

  // Create session
  const { token, expiresAt } = await createSession({
    userId: user.id,
    tenantId,
    authMethod: "password",
    ipAddress,
    userAgent,
  });

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    tenantId,
    hasMultipleTenants: memberships.length > 1,
    isSuperAdmin: user.isSuperAdmin,
    expiresAt,
  };
}

/**
 * Register a new user account.
 * Returns the raw token for the caller to set as httpOnly cookie.
 */
export async function registerUser(params: {
  email: string;
  password: string;
  fullName: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<RegisterResult> {
  const { email, password, fullName, ipAddress, userAgent } = params;

  // Check if email already exists
  const existing = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    throw new AuthError("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(password);

  const [user] = await adminDb
    .insert(users)
    .values({ email, passwordHash, fullName })
    .returning({ id: users.id, email: users.email, fullName: users.fullName });

  if (!user) {
    throw new AuthError("Failed to create account", 500);
  }

  const { token, expiresAt } = await createSession({
    userId: user.id,
    authMethod: "password",
    ipAddress,
    userAgent,
  });

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    expiresAt,
  };
}

/**
 * Register a new user AND create their first tenant in one step.
 * Self-service onboarding flow.
 */
export async function registerUserWithTenant(params: {
  email: string;
  password: string;
  fullName: string;
  tenantName: string;
  tenantSlug: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<RegisterWithTenantResult> {
  const { email, password, fullName, tenantName, tenantSlug, ipAddress, userAgent } =
    params;

  // Check email uniqueness
  const existingUser = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new AuthError("An account with this email already exists", 409);
  }

  // Check slug uniqueness
  const existingTenant = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  if (existingTenant.length > 0) {
    throw new AuthError(
      "An organization with this URL already exists",
      409
    );
  }

  const passwordHash = await hashPassword(password);

  // Create user
  const [user] = await adminDb
    .insert(users)
    .values({ email, passwordHash, fullName })
    .returning({ id: users.id, email: users.email, fullName: users.fullName });

  if (!user) {
    throw new AuthError("Failed to create account", 500);
  }

  // Create tenant
  const [tenant] = await adminDb
    .insert(tenants)
    .values({ name: tenantName, slug: tenantSlug, settings: {} })
    .returning();

  if (!tenant) {
    throw new AuthError("Failed to create organization", 500);
  }

  // Create system roles
  const systemRoles = await adminDb
    .insert(roles)
    .values(
      SYSTEM_ROLES.map((roleSlug) => ({
        tenantId: tenant.id,
        name: roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1),
        slug: roleSlug,
        permissions: SYSTEM_ROLE_PERMISSIONS[roleSlug],
        isSystem: true,
      }))
    )
    .returning();

  const ownerRole = systemRoles.find((r) => r.slug === "owner");
  if (!ownerRole) {
    throw new AuthError("Failed to create owner role", 500);
  }

  // Add user as tenant owner
  await adminDb.insert(tenantMemberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: ownerRole.id,
  });

  // Create session with tenant already selected
  const { token, expiresAt } = await createSession({
    userId: user.id,
    tenantId: tenant.id,
    authMethod: "password",
    ipAddress,
    userAgent,
  });

  // Audit
  await createAuditLog({
    tenantId: tenant.id,
    userId: user.id,
    action: "tenant:created",
    resourceType: "tenant",
    resourceId: tenant.id,
    changes: {
      after: { name: tenant.name, slug: tenant.slug, selfService: true },
    },
    ipAddress,
  });

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    expiresAt,
  };
}

/**
 * Custom error class for auth operations.
 * Includes HTTP status code for API route handlers.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}
