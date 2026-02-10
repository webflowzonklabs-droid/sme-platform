import { db, adminDb } from "../db/index";
import { tenants } from "../db/schema/tenants";
import { sql, eq } from "drizzle-orm";

// ============================================
// Multi-Tenant Helpers
// ============================================

/**
 * Execute a function within a tenant-scoped transaction.
 * Uses the `db` connection (sme_app role) which respects RLS.
 * Sets `app.current_tenant_id` via SET LOCAL so all queries within
 * the transaction are automatically scoped to the tenant by RLS policies.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set the tenant context for RLS policies
    // `true` means this is local to the transaction
    await tx.execute(
      sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    );
    // Execute the function within the transaction
    // We pass tx cast as db since the interface is compatible for queries
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Set tenant context within an already-open transaction.
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
 * Uses adminDb since this is called outside tenant context
 * (e.g., dashboard layout validation).
 */
export async function getTenantSlugById(
  tenantId: string
): Promise<string | null> {
  const [result] = await adminDb
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return result?.slug ?? null;
}
