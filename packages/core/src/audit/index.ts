import { db } from "../db/index";
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
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  await db.insert(auditLogs).values({
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
  entries: AuditLogEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  await db.insert(auditLogs).values(
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
