import { TRPCError } from "@trpc/server";
import { eq, and, sql, count } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  superAdminProcedure,
} from "../procedures";
import { db } from "../../db/index";
import {
  tenants,
  tenantMemberships,
  tenantModules,
  systemModules,
  users,
} from "../../db/schema/index";
import {
  enableModule,
  disableModule,
  getEnabledModules,
  getModuleRegistry,
} from "../../modules/index";
import { createAuditLog } from "../../audit/index";

// ============================================
// Admin Router — platform owner operations
// Only accessible to super admins (isSuperAdmin = true)
// ============================================

export const adminRouter = router({
  /**
   * List all tenants with basic stats.
   */
  listTenants: superAdminProcedure.query(async () => {
    const allTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        isActive: tenants.isActive,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
      })
      .from(tenants)
      .orderBy(tenants.createdAt);

    // Get member counts per tenant
    const memberCounts = await db
      .select({
        tenantId: tenantMemberships.tenantId,
        count: count(),
      })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.isActive, true))
      .groupBy(tenantMemberships.tenantId);

    const countMap = new Map(memberCounts.map((m) => [m.tenantId, m.count]));

    // Get module counts per tenant
    const moduleCounts = await db
      .select({
        tenantId: tenantModules.tenantId,
        count: count(),
      })
      .from(tenantModules)
      .groupBy(tenantModules.tenantId);

    const moduleCountMap = new Map(moduleCounts.map((m) => [m.tenantId, m.count]));

    return allTenants.map((t) => ({
      ...t,
      memberCount: countMap.get(t.id) ?? 0,
      moduleCount: moduleCountMap.get(t.id) ?? 0,
    }));
  }),

  /**
   * Get platform-wide stats.
   */
  stats: superAdminProcedure.query(async () => {
    const [tenantCount] = await db.select({ count: count() }).from(tenants);
    const [userCount] = await db.select({ count: count() }).from(users);
    const [activeTenants] = await db
      .select({ count: count() })
      .from(tenants)
      .where(eq(tenants.isActive, true));

    const registry = getModuleRegistry();

    return {
      totalTenants: tenantCount?.count ?? 0,
      activeTenants: activeTenants?.count ?? 0,
      totalUsers: userCount?.count ?? 0,
      availableModules: registry.size,
    };
  }),

  /**
   * Activate or deactivate a tenant.
   */
  setTenantActive: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(tenants)
        .set({ isActive: input.isActive })
        .where(eq(tenants.id, input.tenantId))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      await createAuditLog({
        tenantId: input.tenantId,
        userId: ctx.session.user.id,
        action: input.isActive ? "admin:tenant:activated" : "admin:tenant:deactivated",
        resourceType: "tenant",
        resourceId: input.tenantId,
        ipAddress: ctx.ipAddress,
      });

      return updated;
    }),

  /**
   * Get enabled modules for a specific tenant.
   */
  getTenantModules: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const enabled = await getEnabledModules(input.tenantId);
      return enabled;
    }),

  /**
   * Enable a module for a specific tenant.
   */
  enableModule: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        moduleId: z.string().min(1).max(50),
        config: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await enableModule(
          input.tenantId,
          input.moduleId,
          input.config,
          ctx.session.user.id
        );
        return { success: true, moduleId: input.moduleId };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to enable module",
        });
      }
    }),

  /**
   * Disable a module for a specific tenant.
   */
  disableModule: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        moduleId: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await disableModule(
          input.tenantId,
          input.moduleId,
          ctx.session.user.id
        );
        return { success: true, moduleId: input.moduleId };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Failed to disable module",
        });
      }
    }),
});
