import { TRPCError } from "@trpc/server";
import { eq, and, gt, ilike } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  tenantProcedure,
  adminProcedure,
} from "../procedures";
import { requirePermission } from "../procedures";
import { db } from "../../db/index";
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
// Users Router — manage users within a tenant
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
      const query = db
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
              ? ilike(users.fullName, `%${input.search}%`)
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
   */
  invite: adminProcedure
    .input(inviteUserSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify the role exists and belongs to this tenant
      const [role] = await db
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

      // Find or create the user
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user) {
        // Create user with a temporary password (they'll need to set their own)
        const tempPasswordHash = await hashPassword(
          crypto.randomUUID()
        );

        [user] = await db
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
      const [existingMembership] = await db
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

      // Create membership
      const [membership] = await db
        .insert(tenantMemberships)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          roleId: input.roleId,
          pinCode: input.pin ?? null,
        })
        .returning();

      // Audit
      await createAuditLog({
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
      });

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
   */
  updateMembership: adminProcedure
    .input(updateMembershipSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify membership belongs to this tenant
      const [membership] = await db
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

      // Prevent deactivating the owner
      if (input.isActive === false) {
        const [currentRole] = await db
          .select({ slug: roles.slug })
          .from(roles)
          .where(eq(roles.id, membership.roleId))
          .limit(1);

        if (currentRole?.slug === "owner") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot deactivate the owner",
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.roleId !== undefined) {
        // Verify the new role belongs to this tenant
        const [newRole] = await db
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

        updateData.roleId = input.roleId;
      }
      if (input.pin !== undefined) updateData.pinCode = input.pin;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updated] = await db
        .update(tenantMemberships)
        .set(updateData)
        .where(eq(tenantMemberships.id, input.membershipId))
        .returning();

      // Audit
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "user:membership_updated",
        resourceType: "membership",
        resourceId: input.membershipId,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      });

      return updated;
    }),

  /**
   * Remove a member from the tenant.
   */
  removeMember: adminProcedure
    .input(z.object({ membershipId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [membership] = await db
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

      await db
        .delete(tenantMemberships)
        .where(eq(tenantMemberships.id, input.membershipId));

      // Audit
      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "user:removed",
        resourceType: "membership",
        resourceId: input.membershipId,
        ipAddress: ctx.ipAddress,
      });

      return { success: true };
    }),
});
