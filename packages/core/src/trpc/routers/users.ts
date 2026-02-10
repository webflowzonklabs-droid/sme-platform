import { TRPCError } from "@trpc/server";
import { eq, and, gt, ilike } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  tenantProcedure,
  adminProcedure,
} from "../procedures";
import { requirePermission } from "../procedures";
import {
  users,
  tenantMemberships,
  roles,
} from "../../db/schema/index";
import { hashPassword } from "../../auth/password";
import { createAuditLog } from "../../audit/index";
import {
  inviteUserSchema,
  updateMembershipSchema,
  paginationSchema,
} from "@sme/shared";
import { paginatedResult } from "@sme/shared";

// ============================================
// Helper: Escape LIKE special characters
// ============================================
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

// ============================================
// Users Router — manage users within a tenant
// All queries use ctx.db (RLS-enforced transaction)
// ============================================

export const usersRouter = router({
  /**
   * List members of the current tenant.
   */
  list: tenantProcedure
    .use(requirePermission("core:users:read"))
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const query = ctx.db
        .select({
          id: tenantMemberships.id,
          userId: users.id,
          email: users.email,
          fullName: users.fullName,
          avatarUrl: users.avatarUrl,
          roleId: roles.id,
          roleName: roles.name,
          roleSlug: roles.slug,
          isActive: tenantMemberships.isActive,
          joinedAt: tenantMemberships.joinedAt,
        })
        .from(tenantMemberships)
        .innerJoin(users, eq(tenantMemberships.userId, users.id))
        .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
        .where(
          and(
            eq(tenantMemberships.tenantId, ctx.tenantId),
            input.search
              ? ilike(users.fullName, `%${escapeLike(input.search)}%`)
              : undefined,
            input.cursor
              ? gt(tenantMemberships.id, input.cursor)
              : undefined
          )
        )
        .limit(input.limit + 1)
        .orderBy(tenantMemberships.joinedAt);

      const items = await query;
      return paginatedResult(items, input.limit);
    }),

  /**
   * Invite a user to the tenant.
   * Creates the user if they don't exist, then adds membership.
   * SECURITY: PINs are hashed before storage. Role assignment checked for escalation.
   */
  invite: adminProcedure
    .input(inviteUserSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify the role exists and belongs to this tenant
      const [role] = await ctx.db
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.id, input.roleId),
            eq(roles.tenantId, ctx.tenantId)
          )
        )
        .limit(1);

      if (!role) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Role not found in this tenant",
        });
      }

      // Prevent assigning owner role unless caller is also an owner or super admin
      if (role.slug === "owner" && ctx.membership.roleSlug !== "owner" && !ctx.session.user.isSuperAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can assign the owner role",
        });
      }

      // Find or create the user (users table has no RLS, so this works in the tx)
      let [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user) {
        const tempPasswordHash = await hashPassword(
          crypto.randomUUID()
        );

        [user] = await ctx.db
          .insert(users)
          .values({
            email: input.email,
            fullName: input.fullName,
            passwordHash: tempPasswordHash,
          })
          .returning();
      }

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Check if already a member
      const [existingMembership] = await ctx.db
        .select()
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, ctx.tenantId),
            eq(tenantMemberships.userId, user.id)
          )
        )
        .limit(1);

      if (existingMembership) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this tenant",
        });
      }

      // Hash PIN before storage if provided
      const pinHash = input.pin ? await hashPassword(input.pin) : null;

      // Create membership — store hashed PIN, not plaintext
      const [membership] = await ctx.db
        .insert(tenantMemberships)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          roleId: input.roleId,
          pinHash,
          pinCode: null,
        })
        .returning();

      // Audit
      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "user:invited",
          resourceType: "user",
          resourceId: user.id,
          changes: {
            after: {
              email: input.email,
              roleId: input.roleId,
              roleName: role.name,
            },
          },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return {
        membership,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      };
    }),

  /**
   * Update a membership (change role, PIN, active status).
   * SECURITY: Owner role cannot be assigned/removed except by owner or super admin.
   * PINs are hashed before storage.
   */
  updateMembership: adminProcedure
    .input(updateMembershipSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify membership belongs to this tenant
      const [membership] = await ctx.db
        .select()
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.id, input.membershipId),
            eq(tenantMemberships.tenantId, ctx.tenantId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      // Get current role
      const [currentRole] = await ctx.db
        .select({ slug: roles.slug })
        .from(roles)
        .where(eq(roles.id, membership.roleId))
        .limit(1);

      // Prevent deactivating the owner
      if (input.isActive === false && currentRole?.slug === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot deactivate the owner",
        });
      }

      const updateData: Record<string, unknown> = {};

      if (input.roleId !== undefined) {
        const [newRole] = await ctx.db
          .select()
          .from(roles)
          .where(
            and(
              eq(roles.id, input.roleId),
              eq(roles.tenantId, ctx.tenantId)
            )
          )
          .limit(1);

        if (!newRole) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Role not found",
          });
        }

        if (newRole.slug === "owner" && ctx.membership.roleSlug !== "owner" && !ctx.session.user.isSuperAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only owners can assign the owner role",
          });
        }

        if (currentRole?.slug === "owner" && newRole.slug !== "owner") {
          if (ctx.membership.roleSlug !== "owner" && !ctx.session.user.isSuperAdmin) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only owners can change the owner role",
            });
          }
        }

        updateData.roleId = input.roleId;
      }

      // Hash PIN before storage
      if (input.pin !== undefined) {
        if (input.pin === null) {
          updateData.pinHash = null;
          updateData.pinCode = null;
        } else {
          updateData.pinHash = await hashPassword(input.pin);
          updateData.pinCode = null;
        }
      }

      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updated] = await ctx.db
        .update(tenantMemberships)
        .set(updateData)
        .where(eq(tenantMemberships.id, input.membershipId))
        .returning();

      // Audit — don't log the actual PIN hash
      const auditChanges = { ...updateData };
      if (auditChanges.pinHash) auditChanges.pinHash = "[REDACTED]";

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "user:membership_updated",
          resourceType: "membership",
          resourceId: input.membershipId,
          changes: { after: auditChanges },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),

  /**
   * Remove a member from the tenant.
   */
  removeMember: adminProcedure
    .input(z.object({ membershipId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await ctx.db
        .select()
        .from(tenantMemberships)
        .innerJoin(roles, eq(tenantMemberships.roleId, roles.id))
        .where(
          and(
            eq(tenantMemberships.id, input.membershipId),
            eq(tenantMemberships.tenantId, ctx.tenantId)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Membership not found",
        });
      }

      if (membership.roles.slug === "owner") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove the owner",
        });
      }

      await ctx.db
        .delete(tenantMemberships)
        .where(eq(tenantMemberships.id, input.membershipId));

      // Audit
      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "user:removed",
          resourceType: "membership",
          resourceId: input.membershipId,
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { success: true };
    }),
});
