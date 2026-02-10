import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ============================================
// SYSTEM MODULES — global module registry
// ============================================
export const systemModules = pgTable("system_modules", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 20 }).notNull(),
  dependencies: text("dependencies").array().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SystemModule = typeof systemModules.$inferSelect;
export type NewSystemModule = typeof systemModules.$inferInsert;

// ============================================
// TENANT MODULES — which modules are enabled per tenant
// ============================================
export const tenantModules = pgTable(
  "tenant_modules",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleId: varchar("module_id", { length: 50 })
      .notNull()
      .references(() => systemModules.id),
    enabledAt: timestamp("enabled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.moduleId] }),
    index("idx_tenant_modules_tenant").on(table.tenantId),
  ]
);

export type TenantModule = typeof tenantModules.$inferSelect;
export type NewTenantModule = typeof tenantModules.$inferInsert;
