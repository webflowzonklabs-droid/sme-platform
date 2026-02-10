import { adminDb, type Database } from "../db/index";
import { auditLogs } from "../db/schema/index";

// ============================================
// Audit Logging — append-only audit trail
// ============================================

export interface AuditLogEntry {
  tenantId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  ipAddress?: string;
}

/**
 * Create an audit log entry.
 * This is append-only — audit logs are never updated or deleted.
 *
 * @param entry - The audit log data
 * @param database - Database connection to use. Pass ctx.db from route handlers
 *                   to ensure the insert runs within the RLS-scoped transaction.
 *                   Defaults to adminDb (superuser) for standalone/admin calls.
 */
export async function createAuditLog(
  entry: AuditLogEntry,
  database: Database = adminDb
): Promise<void> {
  await database.insert(auditLogs).values({
    tenantId: entry.tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    changes: entry.changes ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

/**
 * Create multiple audit log entries in a batch.
 */
export async function createAuditLogBatch(
  entries: AuditLogEntry[],
  database: Database = adminDb
): Promise<void> {
  if (entries.length === 0) return;

  await database.insert(auditLogs).values(
    entries.map((entry) => ({
      tenantId: entry.tenantId,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      changes: entry.changes ?? null,
      ipAddress: entry.ipAddress ?? null,
    }))
  );
}
