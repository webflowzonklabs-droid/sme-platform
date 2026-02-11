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
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "../../db/schema/tenants";
import { users } from "../../db/schema/users";

// ============================================
// CATALOG MODULE — vertical-agnostic product catalog
// ============================================

// --- Categories ---
export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
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
    index("idx_catalog_categories_tenant").on(table.tenantId),
    index("idx_catalog_categories_slug").on(table.tenantId, table.slug),
  ]
);

// --- Subcategories ---
export const catalogSubcategories = pgTable(
  "catalog_subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => catalogCategories.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
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
    index("idx_catalog_subcategories_tenant").on(table.tenantId),
    index("idx_catalog_subcategories_category").on(table.tenantId, table.categoryId),
    index("idx_catalog_subcategories_slug").on(table.tenantId, table.slug),
  ]
);

// --- Products ---
export const catalogProducts = pgTable(
  "catalog_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    slug: varchar("slug", { length: 300 }).notNull(),
    brand: varchar("brand", { length: 200 }),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("PHP").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => catalogCategories.id, { onDelete: "restrict" }),
    stockStatus: varchar("stock_status", { length: 20 })
      .default("in_stock")
      .notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isNew: boolean("is_new").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
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
    index("idx_catalog_products_tenant").on(table.tenantId),
    index("idx_catalog_products_category").on(table.tenantId, table.categoryId),
    index("idx_catalog_products_slug").on(table.tenantId, table.slug),
    index("idx_catalog_products_stock").on(table.tenantId, table.stockStatus),
    index("idx_catalog_products_featured").on(table.tenantId, table.isFeatured),
  ]
);

// --- Product Subcategories (join table) ---
export const catalogProductSubcategories = pgTable(
  "catalog_product_subcategories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => catalogProducts.id, { onDelete: "cascade" }),
    subcategoryId: uuid("subcategory_id")
      .notNull()
      .references(() => catalogSubcategories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.subcategoryId] }),
    index("idx_catalog_product_subcategories_product").on(table.productId),
    index("idx_catalog_product_subcategories_subcategory").on(table.subcategoryId),
  ]
);

// --- Product Photos ---
export const catalogProductPhotos = pgTable(
  "catalog_product_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => catalogProducts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: varchar("alt_text", { length: 300 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_catalog_product_photos_product").on(table.productId),
    index("idx_catalog_product_photos_tenant").on(table.tenantId),
  ]
);

// --- Attribute Definitions ---
export const catalogAttributeDefinitions = pgTable(
  "catalog_attribute_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // text, number, boolean, select
    options: jsonb("options").$type<string[]>(), // for select type
    isRequired: boolean("is_required").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_catalog_attr_defs_tenant").on(table.tenantId),
    index("idx_catalog_attr_defs_slug").on(table.tenantId, table.slug),
  ]
);

// --- Product Attributes (values) ---
export const catalogProductAttributes = pgTable(
  "catalog_product_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => catalogProducts.id, { onDelete: "cascade" }),
    attributeDefinitionId: uuid("attribute_definition_id")
      .notNull()
      .references(() => catalogAttributeDefinitions.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_catalog_product_attrs_product").on(table.productId),
    index("idx_catalog_product_attrs_def").on(table.attributeDefinitionId),
  ]
);

// ============================================
// Types
// ============================================
export type CatalogCategory = typeof catalogCategories.$inferSelect;
export type NewCatalogCategory = typeof catalogCategories.$inferInsert;
export type CatalogSubcategory = typeof catalogSubcategories.$inferSelect;
export type NewCatalogSubcategory = typeof catalogSubcategories.$inferInsert;
export type CatalogProduct = typeof catalogProducts.$inferSelect;
export type NewCatalogProduct = typeof catalogProducts.$inferInsert;
export type CatalogProductPhoto = typeof catalogProductPhotos.$inferSelect;
export type NewCatalogProductPhoto = typeof catalogProductPhotos.$inferInsert;
export type CatalogAttributeDefinition = typeof catalogAttributeDefinitions.$inferSelect;
export type NewCatalogAttributeDefinition = typeof catalogAttributeDefinitions.$inferInsert;
export type CatalogProductAttribute = typeof catalogProductAttributes.$inferSelect;
export type NewCatalogProductAttribute = typeof catalogProductAttributes.$inferInsert;
