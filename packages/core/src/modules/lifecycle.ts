import { eq, and } from "drizzle-orm";
import { db } from "../db/index";
import { systemModules, tenantModules, roles } from "../db/schema/index";
import { getModule } from "./registry";
import { createAuditLog } from "../audit/index";

// ============================================
// Module Lifecycle — enable/disable per tenant
// ============================================

/**
 * Enable a module for a tenant.
 * - Checks dependencies are met
 * - Registers in tenant_modules
 * - Adds default permissions to existing roles
 */
export async function enableModule(
  tenantId: string,
  moduleId: string,
  config?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const moduleConfig = getModule(moduleId);
  if (!moduleConfig) {
    throw new Error(`Module "${moduleId}" is not registered`);
  }

  // Check dependencies
  for (const dep of moduleConfig.dependencies) {
    const isEnabled = await isModuleEnabled(tenantId, dep);
    if (!isEnabled) {
      throw new Error(
        `Module "${moduleId}" requires "${dep}" to be enabled first`
      );
    }
  }

  // Check if already enabled
  const existing = await db
    .select()
    .from(tenantModules)
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(tenantModules.moduleId, moduleId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return; // Already enabled, no-op
  }

  // Ensure module exists in system_modules
  const systemModule = await db
    .select()
    .from(systemModules)
    .where(eq(systemModules.id, moduleId))
    .limit(1);

  if (systemModule.length === 0) {
    await db.insert(systemModules).values({
      id: moduleConfig.id,
      name: moduleConfig.name,
      description: moduleConfig.description ?? null,
      version: moduleConfig.version,
      dependencies: moduleConfig.dependencies,
    });
  }

  // Enable for tenant
  await db.insert(tenantModules).values({
    tenantId,
    moduleId,
    config: config ?? {},
  });

  // Add default permissions to existing roles
  if (moduleConfig.roleDefaults) {
    const tenantRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.tenantId, tenantId));

    for (const role of tenantRoles) {
      const defaultPerms = moduleConfig.roleDefaults[role.slug];
      if (defaultPerms && defaultPerms.length > 0) {
        const existingPerms = role.permissions ?? [];
        const newPerms = [
          ...new Set([...existingPerms, ...defaultPerms]),
        ];

        await db
          .update(roles)
          .set({ permissions: newPerms })
          .where(eq(roles.id, role.id));
      }
    }
  }

  // Audit log
  await createAuditLog({
    tenantId,
    userId,
    action: "module:enabled",
    resourceType: "module",
    resourceId: undefined,
    changes: { after: { moduleId, config } },
  });
}

/**
 * Disable a module for a tenant.
 * - Checks no dependent modules are still enabled
 * - Removes from tenant_modules (data preserved in module tables)
 * - Optionally removes module permissions from roles
 */
export async function disableModule(
  tenantId: string,
  moduleId: string,
  userId?: string
): Promise<void> {
  // Check if any enabled module depends on this one
  const enabledModules = await getEnabledModules(tenantId);
  for (const enabled of enabledModules) {
    const modConfig = getModule(enabled.moduleId);
    if (modConfig && modConfig.dependencies.includes(moduleId)) {
      throw new Error(
        `Cannot disable "${moduleId}" — "${enabled.moduleId}" depends on it`
      );
    }
  }

  // Remove from tenant_modules
  await db
    .delete(tenantModules)
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(tenantModules.moduleId, moduleId)
      )
    );

  // Audit log
  await createAuditLog({
    tenantId,
    userId,
    action: "module:disabled",
    resourceType: "module",
    resourceId: undefined,
    changes: { before: { moduleId } },
  });
}

/**
 * Check if a module is enabled for a tenant.
 */
export async function isModuleEnabled(
  tenantId: string,
  moduleId: string
): Promise<boolean> {
  const result = await db
    .select()
    .from(tenantModules)
    .where(
      and(
        eq(tenantModules.tenantId, tenantId),
        eq(tenantModules.moduleId, moduleId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get all enabled modules for a tenant.
 */
export async function getEnabledModules(
  tenantId: string
): Promise<{ moduleId: string; config: Record<string, unknown> }[]> {
  const result = await db
    .select({
      moduleId: tenantModules.moduleId,
      config: tenantModules.config,
    })
    .from(tenantModules)
    .where(eq(tenantModules.tenantId, tenantId));

  return result.map((r) => ({
    moduleId: r.moduleId,
    config: (r.config as Record<string, unknown>) ?? {},
  }));
}
