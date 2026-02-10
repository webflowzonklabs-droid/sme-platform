import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  protectedProcedure,
  tenantProcedure,
  adminProcedure,
  superAdminProcedure,
} from "../procedures";
import { db } from "../../db/index";
import {
  tenants,
  tenantMemberships,
  roles,
} from "../../db/schema/index";
import { createSession } from "../../auth/session";
import { createAuditLog } from "../../audit/index";
import {
  createTenantSchema,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from "@sme/shared";

// ============================================
// Tenants Router
// ============================================

export const tenantsRouter = router({
  /**
   * Create a new tenant.
   * Only super admins can create tenants (platform-level operation).
   */
  create: superAdminProcedure
    .input(createTenantSchema)
    .mutation(async ({ input, ctx }) => {
      // Check slug uniqueness
      const existing = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A tenant with this slug already exists",
        });
      }

      // Create tenant
      const [tenant] = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          settings: input.settings ?? {},
        })
        .returning();

      if (!tenant) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create tenant",
        });
      }

      // Create system roles for the tenant
      const systemRoles = await db
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

      // Find the owner role
      const ownerRole = systemRoles.find((r) => r.slug === "owner");
      if (!ownerRole) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create owner role",
        });
      }

      // Add the creating user as owner
      await db.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId: ctx.session.user.id,
        roleId: ownerRole.id,
      });

      // Audit
      await createAuditLog({
        tenantId: tenant.id,
        userId: ctx.session.user.id,
        action: "tenant:created",
        resourceType: "tenant",
        resourceId: tenant.id,
        changes: { after: { name: tenant.name, slug: tenant.slug } },
        ipAddress: ctx.ipAddress,
      });

      return { tenant };
    }),

  /**
   * Get current tenant details.
   */
  current: tenantProcedure.query(async ({ ctx }) => {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    if (!tenant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
    }

    return tenant;
  }),

  /**
   * Update tenant settings.
   * SECURITY FIX: Always use ctx.tenantId instead of user-supplied ID.
   * This prevents cross-tenant data modification (C4).
   */
  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200).trim().optional(),
        settings: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const updateData: Record<string, unknown> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.settings !== undefined) updateData.settings = input.settings;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No fields to update",
        });
      }

      // Always use session's tenant ID — never accept user-supplied tenant ID
      const [updated] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, ctx.tenantId))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "tenant:updated",
        resourceType: "tenant",
        resourceId: ctx.tenantId,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      });

      return updated;
    }),
});
