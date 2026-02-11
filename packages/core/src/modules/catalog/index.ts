import { defineModule } from "../registry";
import { catalogRouter } from "./router";

// ============================================
// Catalog Module — vertical-agnostic product catalog
// ============================================

export const catalogModule = defineModule({
  id: "catalog",
  name: "Product Catalog",
  version: "1.0.0",
  description: "Product catalog with categories, photos, and custom attributes",
  dependencies: [],

  permissions: [
    "catalog:products:read",
    "catalog:products:write",
    "catalog:products:delete",
    "catalog:categories:read",
    "catalog:categories:write",
    "catalog:categories:delete",
    "catalog:attributes:read",
    "catalog:attributes:write",
    "catalog:attributes:delete",
  ],

  roleDefaults: {
    owner: ["catalog:*"],
    admin: ["catalog:*"],
    manager: [
      "catalog:products:read",
      "catalog:products:write",
      "catalog:categories:read",
      "catalog:categories:write",
      "catalog:attributes:read",
    ],
    operator: [
      "catalog:products:read",
      "catalog:products:write",
      "catalog:categories:read",
    ],
    viewer: [
      "catalog:products:read",
      "catalog:categories:read",
      "catalog:attributes:read",
    ],
  },

  navigation: [
    {
      label: "Products",
      icon: "Package",
      href: "/catalog/products",
      permission: "catalog:products:read",
    },
    {
      label: "Categories",
      icon: "FolderTree",
      href: "/catalog/categories",
      permission: "catalog:categories:read",
    },
    {
      label: "Attributes",
      icon: "Settings2",
      href: "/catalog/attributes",
      permission: "catalog:attributes:read",
    },
  ],

  router: catalogRouter,
});

export { catalogRouter } from "./router";
export {
  catalogCategories,
  catalogSubcategories,
  catalogProducts,
  catalogProductSubcategories,
  catalogProductPhotos,
  catalogAttributeDefinitions,
  catalogProductAttributes,
  type CatalogCategory,
  type NewCatalogCategory,
  type CatalogSubcategory,
  type NewCatalogSubcategory,
  type CatalogProduct,
  type NewCatalogProduct,
  type CatalogProductPhoto,
  type NewCatalogProductPhoto,
  type CatalogAttributeDefinition,
  type NewCatalogAttributeDefinition,
  type CatalogProductAttribute,
  type NewCatalogProductAttribute,
} from "./schema";
