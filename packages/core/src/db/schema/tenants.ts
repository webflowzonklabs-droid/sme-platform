import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import type { TenantSettings } from "@sme/shared";

// ============================================
// TENANTS — multi-tenant organizations
// ============================================
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).unique().notNull(),
    settings: jsonb("settings").$type<TenantSettings>().default({}),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_tenants_slug").on(table.slug),
    index("idx_tenants_active").on(table.isActive),
  ]
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
