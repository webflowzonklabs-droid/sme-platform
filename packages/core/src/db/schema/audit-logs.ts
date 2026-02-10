import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  inet,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ============================================
// AUDIT LOGS — append-only audit trail
// ============================================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: uuid("resource_id"),
    changes: jsonb("changes").$type<{
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    }>(),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_audit_tenant_date").on(table.tenantId, table.createdAt),
    index("idx_audit_resource").on(
      table.tenantId,
      table.resourceType,
      table.resourceId
    ),
    index("idx_audit_user").on(table.userId),
  ]
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
