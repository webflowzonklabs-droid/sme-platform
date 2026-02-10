import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ============================================
// ROLES — per-tenant roles with permission arrays
// ============================================
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    slug: varchar("slug", { length: 50 }).notNull(),
    description: text("description"),
    permissions: text("permissions")
      .array()
      .notNull()
      .default([]),
    isSystem: boolean("is_system").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_roles_tenant_slug").on(table.tenantId, table.slug),
    index("idx_roles_tenant").on(table.tenantId),
  ]
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
