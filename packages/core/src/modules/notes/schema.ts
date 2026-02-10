import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";

// ============================================
// NOTES — example module to prove module system works
// ============================================
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
  },
  (table) => [
    index("idx_notes_tenant").on(table.tenantId),
    index("idx_notes_user").on(table.tenantId, table.userId),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
