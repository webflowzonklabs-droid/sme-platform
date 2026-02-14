import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  date,
} from "drizzle-orm/pg-core";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";

// ============================================
// COSTING MODULE — recipe costing & raw materials management
// ============================================

// --- Unit type enum values ---
const unitTypes = ["weight", "piece"] as const;
const recipeTypes = ["base", "final"] as const;
const ingredientTypes = ["raw", "base"] as const;

// --- Inventory Items (Raw Materials + Packaging) ---
export const costingInventoryItems = pgTable(
  "costing_inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    brand: varchar("brand", { length: 200 }),
    unitType: varchar("unit_type", { length: 20 }).notNull(), // 'weight' | 'piece'
    unit: varchar("unit", { length: 20 }).notNull(), // 'kg', 'g', 'L', 'mL', 'piece'
    unitSizeGrams: numeric("unit_size_grams", { precision: 12, scale: 4 }),
    category: varchar("category", { length: 100 }).notNull(), // 'critical', 'secondary', 'packaging', custom
    tags: text("tags").array(),
    primarySupplier: varchar("primary_supplier", { length: 200 }),
    secondarySupplier: varchar("secondary_supplier", { length: 200 }),
    notes: text("notes"),
    isActive: boolean("is_active").default(true).notNull(),
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
    index("idx_costing_items_tenant").on(table.tenantId),
    index("idx_costing_items_category").on(table.tenantId, table.category),
    index("idx_costing_items_active").on(table.tenantId, table.isActive),
  ]
);

// --- Price History ---
export const costingPriceHistory = pgTable(
  "costing_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => costingInventoryItems.id, { onDelete: "cascade" }),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 4 }).notNull(),
    pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 6 }).notNull(),
    supplier: varchar("supplier", { length: 200 }),
    effectiveDate: date("effective_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_costing_price_history_tenant").on(table.tenantId),
    index("idx_costing_price_history_item").on(table.itemId),
    index("idx_costing_price_history_date").on(table.itemId, table.effectiveDate),
  ]
);

// --- Recipes ---
export const costingRecipes = pgTable(
  "costing_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'base' | 'final'
    version: integer("version").default(1).notNull(),
    parentRecipeId: uuid("parent_recipe_id"), // self-ref, FK added in migration
    yieldLossPct: numeric("yield_loss_pct", { precision: 5, scale: 2 }).default("0").notNull(),
    rawWeight: numeric("raw_weight", { precision: 12, scale: 4 }),
    netWeight: numeric("net_weight", { precision: 12, scale: 4 }),
    totalCost: numeric("total_cost", { precision: 12, scale: 4 }),
    costPerGram: numeric("cost_per_gram", { precision: 12, scale: 6 }),
    costPerPiece: numeric("cost_per_piece", { precision: 12, scale: 4 }),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2 }).default("12").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).default("0").notNull(),
    cogsPct: numeric("cogs_pct", { precision: 5, scale: 2 }),
    isCurrent: boolean("is_current").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
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
    index("idx_costing_recipes_tenant").on(table.tenantId),
    index("idx_costing_recipes_type").on(table.tenantId, table.type),
    index("idx_costing_recipes_parent").on(table.parentRecipeId),
    index("idx_costing_recipes_current").on(table.tenantId, table.isCurrent),
  ]
);

// --- Recipe Ingredients (line items) ---
export const costingRecipeIngredients = pgTable(
  "costing_recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => costingRecipes.id, { onDelete: "cascade" }),
    ingredientType: varchar("ingredient_type", { length: 20 }).notNull(), // 'raw' | 'base'
    inventoryItemId: uuid("inventory_item_id")
      .references(() => costingInventoryItems.id, { onDelete: "restrict" }),
    baseRecipeId: uuid("base_recipe_id")
      .references(() => costingRecipes.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 6 }).notNull(),
    extendedCost: numeric("extended_cost", { precision: 12, scale: 4 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_costing_ingredients_recipe").on(table.recipeId),
    index("idx_costing_ingredients_item").on(table.inventoryItemId),
    index("idx_costing_ingredients_base_recipe").on(table.baseRecipeId),
  ]
);

// --- Costing Snapshots ---
export const costingSnapshots = pgTable(
  "costing_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => costingRecipes.id, { onDelete: "cascade" }),
    snapshotDate: timestamp("snapshot_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    totalCost: numeric("total_cost", { precision: 12, scale: 4 }).notNull(),
    costPerGram: numeric("cost_per_gram", { precision: 12, scale: 6 }),
    cogsPct: numeric("cogs_pct", { precision: 5, scale: 2 }),
    ingredientCosts: jsonb("ingredient_costs").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_costing_snapshots_tenant").on(table.tenantId),
    index("idx_costing_snapshots_recipe").on(table.recipeId),
    index("idx_costing_snapshots_date").on(table.recipeId, table.snapshotDate),
  ]
);

// ============================================
// Types
// ============================================
export type CostingInventoryItem = typeof costingInventoryItems.$inferSelect;
export type NewCostingInventoryItem = typeof costingInventoryItems.$inferInsert;
export type CostingPriceHistory = typeof costingPriceHistory.$inferSelect;
export type NewCostingPriceHistory = typeof costingPriceHistory.$inferInsert;
export type CostingRecipe = typeof costingRecipes.$inferSelect;
export type NewCostingRecipe = typeof costingRecipes.$inferInsert;
export type CostingRecipeIngredient = typeof costingRecipeIngredients.$inferSelect;
export type NewCostingRecipeIngredient = typeof costingRecipeIngredients.$inferInsert;
export type CostingSnapshot = typeof costingSnapshots.$inferSelect;
export type NewCostingSnapshot = typeof costingSnapshots.$inferInsert;
