import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// ============================================
// Database Connection (Lazy-Initialized, Single Pool)
// ============================================
// Single connection pool using DATABASE_URL. Tenant isolation is
// enforced at the application layer with WHERE tenant_id = ? filters.
// No RLS, no SET LOCAL, no dual-connection complexity.
// ============================================

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

/** Single database connection — all queries go through here */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

/**
 * @deprecated Use `db` instead. Kept as alias for backward compatibility
 * during migration. Will be removed in a future release.
 */
export const adminDb = db;

// Export schema for convenience
export { schema };

// Export types
export type Database = typeof db;

// Re-export schema types
export * from "./schema/index";
