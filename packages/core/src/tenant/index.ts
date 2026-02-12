import { db } from "../db/index";
import { tenants } from "../db/schema/tenants";
import { eq } from "drizzle-orm";

// ============================================
// Multi-Tenant Helpers
// ============================================
// Tenant isolation is enforced at the application layer via
// WHERE tenant_id = ? filters in all queries. No RLS, no
// SET LOCAL, no transaction wrappers needed.
// ============================================

/**
 * Get a tenant's slug by ID.
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
