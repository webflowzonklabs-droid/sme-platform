import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../procedures";
import { db } from "../../db/index";
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
} from "@sme/shared";

// ============================================
// PIN Rate Limiting Constants
// ============================================
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ============================================
// Auth Router — login, register, logout, session
// ============================================

export const authRouter = router({
  /**
   * Register a new user account.
   */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if email already exists
      const existing = await db
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
      const [user] = await db
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

      return { token, user: { id: user.id, email: user.email }, expiresAt };
    }),

  /**
   * Login with email + password.
   */
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      // Find user
      const [user] = await db
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

      // Verify password
      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      // Check if user has exactly one tenant — auto-select it
      const memberships = await db
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

      const tenantId =
        memberships.length === 1 ? memberships[0]!.tenantId : null;

      // Create session
      const { token, expiresAt } = await createSession({
        userId: user.id,
        tenantId,
        authMethod: "password",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        tenantId,
        hasMultipleTenants: memberships.length > 1, // Fixed typo: was hasMulipleTenants
        expiresAt,
      };
    }),

  /**
   * PIN-based quick login (for POS/kiosk workflows).
   * SECURITY: PINs are now hashed. Rate limited: 5 attempts per 15 min.
   */
  pinLogin: publicProcedure
    .input(pinLoginSchema)
    .mutation(async ({ input, ctx }) => {
      // Find membership
      const [membership] = await db
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
        // Verify against hashed PIN
        pinValid = await verifyPassword(input.pin, membership.pinHash!);
      } else if (hasLegacyPin) {
        // Legacy plaintext comparison (for un-migrated PINs)
        pinValid = membership.pinCode === input.pin;
        // If valid, upgrade to hashed PIN
        if (pinValid) {
          const newPinHash = await hashPassword(input.pin);
          await db
            .update(tenantMemberships)
            .set({ pinHash: newPinHash, pinCode: null })
            .where(eq(tenantMemberships.id, membership.membershipId));
        }
      }

      if (!pinValid) {
        // Increment failed attempts
        const newAttempts = (membership.pinFailedAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = {
          pinFailedAttempts: newAttempts,
        };

        // Lock out after MAX_PIN_ATTEMPTS failures
        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          updateData.pinLockedUntil = new Date(
            Date.now() + PIN_LOCKOUT_DURATION_MS
          );
        }

        await db
          .update(tenantMemberships)
          .set(updateData)
          .where(eq(tenantMemberships.id, membership.membershipId));

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid PIN",
        });
      }

      // Reset failed attempts on successful login
      await db
        .update(tenantMemberships)
        .set({ pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(tenantMemberships.id, membership.membershipId));

      // Check user is active
      const [user] = await db
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

      return { token, expiresAt };
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
      // Verify user is a member of the target tenant
      const [membership] = await db
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
   */
  myTenants: protectedProcedure.query(async ({ ctx }) => {
    const results = await db
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
