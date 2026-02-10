import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { roles } from "./roles";

// ============================================
// TENANT MEMBERSHIPS — user ↔ tenant with role + PIN
// ============================================
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    pinCode: varchar("pin_code", { length: 10 }),
    pinHash: text("pin_hash"),
    pinFailedAttempts: integer("pin_failed_attempts").default(0).notNull(),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idx_membership_tenant_user").on(
      table.tenantId,
      table.userId
    ),
    index("idx_membership_tenant").on(table.tenantId),
    index("idx_membership_user").on(table.userId),
  ]
);

export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type NewTenantMembership = typeof tenantMemberships.$inferInsert;
