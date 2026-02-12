import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../procedures";
import { adminDb } from "../../db/index";
import {
  users,
  tenantMemberships,
  tenants,
  roles,
} from "../../db/schema/index";
import { hashPassword, verifyPassword } from "../../auth/password";
import { createSession, invalidateSession } from "../../auth/session";
import { updateSessionTenant } from "../../auth/session";
import { createAuditLog } from "../../audit/index";
import {
  loginSchema,
  registerSchema,
  pinLoginSchema,
  createTenantSchema,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from "@sme/shared";

// ============================================
// Rate Limiting Constants
// ============================================
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ============================================
// Auth Router — login, register, logout, session
//
// NOTE: Auth procedures use ctx.db (adminDb) because they operate
// before tenant context is established and need cross-tenant access
// to users and memberships.
//
// SECURITY (2026-02-11): Login and register responses do NOT return
// raw session tokens. Tokens are only set via httpOnly cookies in the
// API route handlers (/api/auth/login, /api/auth/register).
// The tRPC procedures return a tokenInternal field that should only
// be used server-side (e.g., in API route handlers).
// ============================================

export const authRouter = router({
  /**
   * Register a new user account.
   * Returns session info but NOT the token (token set via httpOnly cookie by API route).
   */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if email already exists
      const existing = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Create user
      const [user] = await ctx.db
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          fullName: input.fullName,
        })
        .returning({ id: users.id, email: users.email });

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create session
      const { token, expiresAt } = await createSession({
        userId: user.id,
        authMethod: "password",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      // Token is returned as _tokenInternal for server-side use only
      // The API route handler sets this as an httpOnly cookie
      return {
        _tokenInternal: token,
        user: { id: user.id, email: user.email },
        expiresAt,
      };
    }),

  /**
   * Register a new user AND create their first tenant in one step.
   * This is the self-service onboarding flow.
   * Returns session info but NOT the raw token.
   */
  registerWithTenant: publicProcedure
    .input(
      registerSchema.extend({
        tenantName: z.string().min(1).max(200).trim(),
        tenantSlug: z
          .string()
          .min(2)
          .max(100)
          .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
          .transform((v) => v.toLowerCase()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if email already exists
      const existing = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      // Check slug uniqueness
      const existingTenant = await ctx.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.tenantSlug))
        .limit(1);

      if (existingTenant.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An organization with this URL already exists",
        });
      }

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Create user
      const [user] = await ctx.db
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          fullName: input.fullName,
        })
        .returning({ id: users.id, email: users.email, fullName: users.fullName });

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create tenant
      const [tenant] = await ctx.db
        .insert(tenants)
        .values({
          name: input.tenantName,
          slug: input.tenantSlug,
          settings: {},
        })
        .returning();

      if (!tenant) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create organization",
        });
      }

      // Create system roles for the tenant
      const systemRoles = await ctx.db
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create owner role",
        });
      }

      // Add user as tenant owner
      await ctx.db.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId: user.id,
        roleId: ownerRole.id,
      });

      // Create session with tenant already selected
      const { token, expiresAt } = await createSession({
        userId: user.id,
        tenantId: tenant.id,
        authMethod: "password",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      // Audit
      await createAuditLog({
        tenantId: tenant.id,
        userId: user.id,
        action: "tenant:created",
        resourceType: "tenant",
        resourceId: tenant.id,
        changes: { after: { name: tenant.name, slug: tenant.slug } },
        ipAddress: ctx.ipAddress,
      });

      return {
        _tokenInternal: token,
        user: { id: user.id, email: user.email, fullName: user.fullName },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        expiresAt,
      };
    }),

  /**
   * Login with email + password.
   * SECURITY: Rate limited — max 10 failed attempts per 15 minutes.
   * Returns session info but NOT the raw token.
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      // Find user
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user || !user.isActive) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Check login lockout
      if (
        user.loginLockedUntil &&
        new Date() < new Date(user.loginLockedUntil)
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many failed login attempts. Please try again later.",
        });
      }

      // Verify password
      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        // Increment failed attempts
        const newAttempts = (user.loginFailedAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = {
          loginFailedAttempts: newAttempts,
        };

        // Lock out after MAX_LOGIN_ATTEMPTS failures
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          updateData.loginLockedUntil = new Date(
            Date.now() + LOGIN_LOCKOUT_DURATION_MS
          );
        }

        await ctx.db
          .update(users)
          .set(updateData)
          .where(eq(users.id, user.id));

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Reset failed attempts on successful login
      if (user.loginFailedAttempts > 0 || user.loginLockedUntil) {
        await ctx.db
          .update(users)
          .set({ loginFailedAttempts: 0, loginLockedUntil: null })
          .where(eq(users.id, user.id));
      }

      // Check if user has exactly one tenant — auto-select it
      const memberships = await ctx.db
        .select({
          tenantId: tenantMemberships.tenantId,
        })
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
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return {
        _tokenInternal: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        tenantId,
        hasMultipleTenants: memberships.length > 1,
        expiresAt,
      };
    }),

  /**
   * PIN-based quick login (for POS/kiosk workflows).
   * SECURITY: PINs are hashed. Rate limited: 5 attempts per 15 min.
   */
  pinLogin: publicProcedure
    .input(pinLoginSchema)
    .mutation(async ({ input, ctx }) => {
      // Find membership (uses adminDb via ctx.db for cross-tenant access)
      const [membership] = await ctx.db
        .select({
          membershipId: tenantMemberships.id,
          userId: tenantMemberships.userId,
          tenantId: tenantMemberships.tenantId,
          pinCode: tenantMemberships.pinCode,
          pinHash: tenantMemberships.pinHash,
          pinFailedAttempts: tenantMemberships.pinFailedAttempts,
          pinLockedUntil: tenantMemberships.pinLockedUntil,
          isActive: tenantMemberships.isActive,
        })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, input.tenantId),
            eq(tenantMemberships.userId, input.userId)
          )
        )
        .limit(1);

      if (!membership || !membership.isActive) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid PIN",
        });
      }

      // Check lockout
      if (
        membership.pinLockedUntil &&
        new Date() < new Date(membership.pinLockedUntil)
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many failed PIN attempts. Please try again later.",
        });
      }

      // Determine which PIN field to check (support migration from plaintext to hashed)
      const hasPinHash = !!membership.pinHash;
      const hasLegacyPin = !!membership.pinCode;

      if (!hasPinHash && !hasLegacyPin) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid PIN",
        });
      }

      let pinValid = false;
      if (hasPinHash) {
        pinValid = await verifyPassword(input.pin, membership.pinHash!);
      } else if (hasLegacyPin) {
        pinValid = membership.pinCode === input.pin;
        if (pinValid) {
          const newPinHash = await hashPassword(input.pin);
          await ctx.db
            .update(tenantMemberships)
            .set({ pinHash: newPinHash, pinCode: null })
            .where(eq(tenantMemberships.id, membership.membershipId));
        }
      }

      if (!pinValid) {
        const newAttempts = (membership.pinFailedAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = {
          pinFailedAttempts: newAttempts,
        };

        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          updateData.pinLockedUntil = new Date(
            Date.now() + PIN_LOCKOUT_DURATION_MS
          );
        }

        await ctx.db
          .update(tenantMemberships)
          .set(updateData)
          .where(eq(tenantMemberships.id, membership.membershipId));

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid PIN",
        });
      }

      // Reset failed attempts on successful login
      await ctx.db
        .update(tenantMemberships)
        .set({ pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(tenantMemberships.id, membership.membershipId));

      // Check user is active
      const [user] = await ctx.db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, membership.userId))
        .limit(1);

      if (!user || !user.isActive) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Account is disabled",
        });
      }

      // Create short-lived session
      const { token, expiresAt } = await createSession({
        userId: membership.userId,
        tenantId: membership.tenantId,
        authMethod: "pin",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      // Token returned as _tokenInternal for server-side cookie setting
      return { _tokenInternal: token, expiresAt };
    }),

  /**
   * Logout — invalidate current session.
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await invalidateSession(ctx.session.session.id);
    return { success: true };
  }),

  /**
   * Get current session info.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      user: ctx.session.user,
      session: {
        id: ctx.session.session.id,
        tenantId: ctx.session.session.tenantId,
        authMethod: ctx.session.session.authMethod,
        expiresAt: ctx.session.session.expiresAt,
      },
      membership: ctx.session.membership ?? null,
    };
  }),

  /**
   * Switch tenant context.
   */
  switchTenant: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a member of the target tenant (uses adminDb for cross-tenant)
      const [membership] = await ctx.db
        .select()
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, ctx.session.user.id),
            eq(tenantMemberships.tenantId, input.tenantId),
            eq(tenantMemberships.isActive, true)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this tenant",
        });
      }

      // Update session's tenant context
      await updateSessionTenant(ctx.session.session.id, input.tenantId);

      return { tenantId: input.tenantId };
    }),

  /**
   * List tenants the current user belongs to.
   * Uses adminDb (via ctx.db) since this is cross-tenant.
   */
  myTenants: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        roleSlug: roles.slug,
        roleName: roles.name,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
      .where(
        and(
          eq(tenantMemberships.userId, ctx.session.user.id),
          eq(tenantMemberships.isActive, true),
          eq(tenants.isActive, true)
        )
      );

    return results;
  }),
});
