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
import {
  tenants,
  tenantMemberships,
  roles,
} from "../../db/schema/index";
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
   * Create a new tenant (super-admin only).
   * For self-service onboarding, use auth.registerWithTenant or tenants.createFirst.
   */
  create: superAdminProcedure
    .input(createTenantSchema)
    .mutation(async ({ input, ctx }) => {
      // Check slug uniqueness
      const existing = await ctx.db
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
      const [tenant] = await ctx.db
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

      // Find the owner role
      const ownerRole = systemRoles.find((r) => r.slug === "owner");
      if (!ownerRole) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create owner role",
        });
      }

      // Add the creating user as owner
      await ctx.db.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId: ctx.session.user.id,
        roleId: ownerRole.id,
      });

      // Audit (uses ctx.db which is adminDb for super admin)
      await createAuditLog(
        {
          tenantId: tenant.id,
          userId: ctx.session.user.id,
          action: "tenant:created",
          resourceType: "tenant",
          resourceId: tenant.id,
          changes: { after: { name: tenant.name, slug: tenant.slug } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { tenant };
    }),

  /**
   * Create first tenant for a user with zero tenants (self-service onboarding).
   * Only works if the user has NO existing tenant memberships.
   * This is the ONLY way a non-super-admin can create a tenant.
   */
  createFirst: protectedProcedure
    .input(createTenantSchema)
    .mutation(async ({ input, ctx }) => {
      // Verify user has zero tenants
      const existingMemberships = await ctx.db
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, ctx.session.user.id))
        .limit(1);

      if (existingMemberships.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You already belong to an organization. Contact an admin to create additional organizations.",
        });
      }

      // Check slug uniqueness
      const existing = await ctx.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An organization with this URL already exists",
        });
      }

      // Create tenant
      const [tenant] = await ctx.db
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
          message: "Failed to create organization",
        });
      }

      // Create system roles
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

      // Add user as owner
      await ctx.db.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId: ctx.session.user.id,
        roleId: ownerRole.id,
      });

      // Audit
      await createAuditLog(
        {
          tenantId: tenant.id,
          userId: ctx.session.user.id,
          action: "tenant:created",
          resourceType: "tenant",
          resourceId: tenant.id,
          changes: { after: { name: tenant.name, slug: tenant.slug, selfService: true } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { tenant };
    }),

  /**
   * Get current tenant details.
   * Uses ctx.db (RLS-enforced transaction).
   */
  current: tenantProcedure.query(async ({ ctx }) => {
    const [tenant] = await ctx.db
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
   * Uses ctx.db (RLS-enforced transaction).
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
      const [updated] = await ctx.db
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

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "tenant:updated",
          resourceType: "tenant",
          resourceId: ctx.tenantId,
          changes: { after: updateData },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),
});
