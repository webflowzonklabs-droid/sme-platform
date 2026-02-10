import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  inet,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

// ============================================
// SESSIONS — database-backed sessions
// ============================================
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").unique().notNull(),
    authMethod: varchar("auth_method", { length: 20 })
      .default("password")
      .notNull(),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_sessions_token").on(table.tokenHash),
    index("idx_sessions_user").on(table.userId),
    index("idx_sessions_expires").on(table.expiresAt),
  ]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
