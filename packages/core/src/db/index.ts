import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// ============================================
// Database Connections (Lazy-Initialized)
// ============================================
// Connections are created on first access to avoid errors during
// Next.js build-time page data collection (no env vars at build).
//
// Two connection pools for RLS compliance:
//
// 1. `db` — connects as `sme_app` (non-superuser).
//    Respects Row-Level Security. Used for tenant-scoped queries
//    within transactions that set `app.current_tenant_id`.
//
// 2. `adminDb` — connects as `sme_user` (superuser).
//    Bypasses RLS. Used for: session validation, auth flows,
//    admin operations, migrations, and any cross-tenant queries.
//
// ARCHITECTURE DECISION (2026-02-11):
// Super-admin and auth operations use `adminDb` because they inherently
// need cross-tenant visibility (listing all tenants, validating sessions
// against memberships, etc.). Tenant-scoped operations use `db` inside
// a transaction with SET LOCAL for defense-in-depth via RLS.
// ============================================

let _db: ReturnType<typeof drizzle> | null = null;
let _adminDb: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    const appConnectionString = process.env.DATABASE_URL;
    if (!appConnectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const appClient = postgres(appConnectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(appClient, { schema });
  }
  return _db;
}

function getAdminDb() {
  if (!_adminDb) {
    const appConnectionString = process.env.DATABASE_URL;
    const adminConnectionString = process.env.DATABASE_ADMIN_URL ?? appConnectionString;
    if (!adminConnectionString) {
      throw new Error("DATABASE_URL or DATABASE_ADMIN_URL environment variable is required");
    }
    const adminClient = postgres(adminConnectionString, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _adminDb = drizzle(adminClient, { schema });
  }
  return _adminDb;
}

/** Tenant-scoped database — connects as sme_app, respects RLS */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

/** Admin database — connects as superuser, bypasses RLS */
export const adminDb = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getAdminDb() as any)[prop];
  },
});

// Export schema for convenience
export { schema };

// Export types
export type Database = typeof db;

// Re-export schema types
export * from "./schema/index";
