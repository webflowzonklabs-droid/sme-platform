import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// ============================================
// Database Connections
// ============================================
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

const appConnectionString = process.env.DATABASE_URL;
if (!appConnectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Admin/superuser connection for auth, session validation, admin ops, migrations
// Falls back to DATABASE_URL if DATABASE_ADMIN_URL is not set (dev convenience)
const adminConnectionString =
  process.env.DATABASE_ADMIN_URL ?? appConnectionString;

// App connection pool (sme_app role, respects RLS)
const appClient = postgres(appConnectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Admin connection pool (sme_user superuser, bypasses RLS)
const adminClient = postgres(adminConnectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Tenant-scoped database — connects as sme_app, respects RLS */
export const db = drizzle(appClient, { schema });

/** Admin database — connects as superuser, bypasses RLS */
export const adminDb = drizzle(adminClient, { schema });

// Export schema for convenience
export { schema };

// Export types
export type Database = typeof db;

// Re-export schema types
export * from "./schema/index";
