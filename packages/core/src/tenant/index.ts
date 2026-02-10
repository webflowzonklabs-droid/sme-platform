import { db } from "../db/index";
import { tenants } from "../db/schema/tenants";
import { sql, eq } from "drizzle-orm";

// ============================================
// Multi-Tenant Helpers
// ============================================

/**
 * Execute a function within a tenant context.
 * Sets RLS context via SET LOCAL so all queries within
 * the transaction are automatically scoped to the tenant.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set the tenant context for RLS policies
    await tx.execute(
      sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    );
    // Execute the function within the transaction
    // We pass tx cast as db since the interface is compatible for queries
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Set tenant context without a transaction wrapper.
 * Useful when you need to set context at the middleware level
 * and have multiple operations share the same context.
 * 
 * NOTE: Only use this within an already-open transaction.
 */
export async function setTenantContext(
  tx: typeof db,
  tenantId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
  );
}

/**
 * Get a tenant's slug by ID.
 * Used by the dashboard layout to validate URL slug matches session tenant.
 */
export async function getTenantSlugById(
  tenantId: string
): Promise<string | null> {
  const [result] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return result?.slug ?? null;
}
