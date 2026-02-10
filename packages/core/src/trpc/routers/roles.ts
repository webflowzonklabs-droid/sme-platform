import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import {
  router,
  tenantProcedure,
  adminProcedure,
} from "../procedures";
import { requirePermission } from "../procedures";
import { db } from "../../db/index";
import { roles, tenantMemberships } from "../../db/schema/index";
import { createAuditLog } from "../../audit/index";
import {
  createRoleSchema,
  updateRoleSchema,
} from "@sme/shared";
import { hasPermission } from "@sme/shared";
import { z } from "zod";

// ============================================
// Roles Router — manage roles within a tenant
// ============================================

/**
 * Check if a user can assign the given permissions.
 * Users can only assign permissions they themselves have.
 * This prevents privilege escalation.
 */
function canAssignPermissions(
  userPermissions: string[],
  targetPermissions: string[]
): boolean {
  // Super wildcard holders can assign anything
  if (userPermissions.includes("*")) return true;

  // Check each target permission is held by the user
  return targetPermissions.every((perm) =>
    hasPermission(userPermissions, perm)
  );
}

export const rolesRouter = router({
  /**
   * List all roles for the current tenant.
   */
  list: tenantProcedure
    .use(requirePermission("core:users:read"))
    .query(async ({ ctx }) => {
      const result = await db
        .select()
        .from(roles)
        .where(eq(roles.tenantId, ctx.tenantId))
        .orderBy(roles.createdAt);

      return result;
    }),

  /**
   * Get a specific role.
   */
  get: tenantProcedure
    .use(requirePermission("core:users:read"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [role] = await db
        .select()
        .from(roles)
        .where(
          and(eq(roles.id, input.id), eq(roles.tenantId, ctx.tenantId))
        )
        .limit(1);

      if (!role) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      }

      return role;
    }),

  /**
   * Create a custom role.
   * SECURITY: Users can only assign permissions they hold (prevents escalation).
   */
  create: adminProcedure
    .input(createRoleSchema)
    .mutation(async ({ input, ctx }) => {
      // Prevent privilege escalation: users cannot create roles with perms they don't have
      if (!canAssignPermissions(ctx.membership.permissions, input.permissions)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot assign permissions you do not have",
        });
      }

      // Check slug uniqueness within tenant
      const [existing] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.tenantId, ctx.tenantId),
            eq(roles.slug, input.slug)
          )
        )
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A role with this slug already exists",
        });
      }

      const [role] = await db
        .insert(roles)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          permissions: input.permissions,
          isSystem: false,
        })
        .returning();

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "role:created",
        resourceType: "role",
        resourceId: role!.id,
        changes: {
          after: { name: input.name, permissions: input.permissions },
        },
        ipAddress: ctx.ipAddress,
      });

      return role;
    }),

  /**
   * Update a role.
   * SECURITY: Cannot modify system role permissions. Cannot escalate privileges.
   */
  update: adminProcedure
    .input(updateRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(roles)
        .where(
          and(eq(roles.id, input.id), eq(roles.tenantId, ctx.tenantId))
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      }

      // Cannot modify system roles at all (not name, not permissions)
      if (existing.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify system roles",
        });
      }

      // Prevent privilege escalation when updating permissions
      if (input.permissions) {
        if (!canAssignPermissions(ctx.membership.permissions, input.permissions)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot assign permissions you do not have",
          });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.permissions !== undefined) updateData.permissions = input.permissions;

      const [updated] = await db
        .update(roles)
        .set(updateData)
        .where(eq(roles.id, input.id))
        .returning();

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "role:updated",
        resourceType: "role",
        resourceId: input.id,
        changes: { before: { permissions: existing.permissions }, after: updateData },
        ipAddress: ctx.ipAddress,
      });

      return updated;
    }),

  /**
   * Delete a custom role.
   * Cannot delete system roles or roles that are assigned to users.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [role] = await db
        .select()
        .from(roles)
        .where(
          and(eq(roles.id, input.id), eq(roles.tenantId, ctx.tenantId))
        )
        .limit(1);

      if (!role) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      }

      if (role.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete system roles",
        });
      }

      // Check if any users are assigned this role
      const [assignment] = await db
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.roleId, input.id))
        .limit(1);

      if (assignment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete a role that is assigned to users. Reassign them first.",
        });
      }

      await db.delete(roles).where(eq(roles.id, input.id));

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "role:deleted",
        resourceType: "role",
        resourceId: input.id,
        changes: { before: { name: role.name } },
        ipAddress: ctx.ipAddress,
      });

      return { success: true };
    }),
});
