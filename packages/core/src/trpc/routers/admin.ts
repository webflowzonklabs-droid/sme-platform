import { TRPCError } from "@trpc/server";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import {
  router,
  superAdminProcedure,
} from "../procedures";
import {
  tenants,
  tenantMemberships,
  tenantModules,
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
//
// ARCHITECTURE DECISION (2026-02-11):
// Admin operations use ctx.db which is adminDb (superuser connection).
// This INTENTIONALLY bypasses RLS because admin operations need
// cross-tenant visibility (listing all tenants, managing modules,
// getting platform-wide stats, etc.).
//
// Security is enforced by the superAdminProcedure middleware which
// verifies the user has isSuperAdmin = true before any admin route
// can execute. This is defense-in-depth: authorization at the
// application layer (superAdminProcedure) + RLS at the database
// layer for tenant-scoped operations.
// ============================================

export const adminRouter = router({
  /**
   * List all tenants with basic stats.
   * Uses adminDb to query across all tenants.
   */
  listTenants: superAdminProcedure.query(async ({ ctx }) => {
    const allTenants = await ctx.db
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
    const memberCounts = await ctx.db
      .select({
        tenantId: tenantMemberships.tenantId,
        count: count(),
      })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.isActive, true))
      .groupBy(tenantMemberships.tenantId);

    const countMap = new Map(memberCounts.map((m) => [m.tenantId, m.count]));

    // Get module counts per tenant
    const moduleCounts = await ctx.db
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
  stats: superAdminProcedure.query(async ({ ctx }) => {
    const [tenantCount] = await ctx.db.select({ count: count() }).from(tenants);
    const [userCount] = await ctx.db.select({ count: count() }).from(users);
    const [activeTenants] = await ctx.db
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
      const [updated] = await ctx.db
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

      await createAuditLog(
        {
          tenantId: input.tenantId,
          userId: ctx.session.user.id,
          action: input.isActive ? "admin:tenant:activated" : "admin:tenant:deactivated",
          resourceType: "tenant",
          resourceId: input.tenantId,
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),

  /**
   * Get enabled modules for a specific tenant.
   */
  getTenantModules: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const enabled = await getEnabledModules(input.tenantId, ctx.db);
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
          ctx.session.user.id,
          ctx.db
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
          ctx.session.user.id,
          ctx.db
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
