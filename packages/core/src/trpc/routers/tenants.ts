import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  protectedProcedure,
  tenantProcedure,
  adminProcedure,
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
  updateTenantSchema,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from "@sme/shared";

// ============================================
// Tenants Router
// ============================================

export const tenantsRouter = router({
  /**
   * Create a new tenant.
   * The creating user becomes the owner.
   */
  create: protectedProcedure
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

      // Create a new session with the tenant context
      const { token, expiresAt } = await createSession({
        userId: ctx.session.user.id,
        tenantId: tenant.id,
        authMethod: ctx.session.session.authMethod as "password" | "pin" | "oauth",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
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

      return { tenant, token, expiresAt };
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
   */
  update: adminProcedure
    .input(updateTenantSchema)
    .mutation(async ({ input, ctx }) => {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.settings !== undefined) updateData.settings = input.settings;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const [updated] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      await createAuditLog({
        tenantId: input.id,
        userId: ctx.session.user.id,
        action: "tenant:updated",
        resourceType: "tenant",
        resourceId: input.id,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      });

      return updated;
    }),
});
