import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  router,
  tenantProcedure,
  superAdminProcedure,
} from "../procedures";
import { db } from "../../db/index";
import { systemModules } from "../../db/schema/index";
import {
  getModuleRegistry,
  getModule,
  enableModule,
  disableModule,
  getEnabledModules,
} from "../../modules/index";
import { enableModuleSchema, disableModuleSchema } from "@sme/shared";
import { z } from "zod";

// ============================================
// Modules Router — manage modules per tenant
// ============================================

export const modulesRouter = router({
  /**
   * List all available modules.
   */
  available: tenantProcedure.query(async () => {
    const registry = getModuleRegistry();
    return Array.from(registry.values()).map((mod) => ({
      id: mod.id,
      name: mod.name,
      version: mod.version,
      description: mod.description,
      dependencies: mod.dependencies,
      permissions: mod.permissions,
    }));
  }),

  /**
   * List enabled modules for current tenant.
   */
  enabled: tenantProcedure.query(async ({ ctx }) => {
    const enabled = await getEnabledModules(ctx.tenantId);
    return enabled.map((m) => {
      const modConfig = getModule(m.moduleId);
      return {
        moduleId: m.moduleId,
        config: m.config,
        name: modConfig?.name ?? m.moduleId,
        version: modConfig?.version ?? "unknown",
        navigation: modConfig?.navigation ?? [],
      };
    });
  }),

  /**
   * Enable a module for a tenant.
   * SECURITY: Only super admins (platform owner) can enable/disable modules.
   * This is the monetization model — tenants do NOT control their own modules.
   */
  enable: superAdminProcedure
    .input(
      enableModuleSchema.extend({
        tenantId: z.string().uuid(),
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
   * Disable a module for a tenant.
   * SECURITY: Only super admins (platform owner) can enable/disable modules.
   */
  disable: superAdminProcedure
    .input(
      disableModuleSchema.extend({
        tenantId: z.string().uuid(),
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
