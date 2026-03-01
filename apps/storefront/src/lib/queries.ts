import { db } from "./db";
import { sql } from "drizzle-orm";

// Get tenant ID by slug
async function getTenantId(): Promise<string> {
  const slug = (process.env.TENANT_SLUG || "nekneks-airsoft").trim();
  const result = await db.execute(
    sql`SELECT id FROM tenants WHERE slug = ${slug} AND is_active = true LIMIT 1`
  );
  if (!result.length) throw new Error(`Tenant ${slug} not found`);
  return result[0].id as string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  price: string | null;
  stockStatus: string;
  isFeatured: boolean;
  isNew: boolean;
  photoUrl: string | null;
  photoAlt: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  subcategorySlug: string | null;
}

export async function getProducts(opts?: {
  subcategorySlug?: string;
  search?: string;
  stockFilter?: string;
  limit?: number;
  offset?: number;
}): Promise<Product[]> {
  const tenantId = await getTenantId();
  const conditions: string[] = [
    `p.tenant_id = '${tenantId}'`,
    `p.deleted_at IS NULL`,
    `p.is_active = true`,
  ];

  if (opts?.subcategorySlug) {
    conditions.push(
      `ps.subcategory_id IN (SELECT id FROM catalog_subcategories WHERE slug = '${opts.subcategorySlug}' AND tenant_id = '${tenantId}')`
    );
  }
  if (opts?.search) {
    const term = opts.search.replace(/'/g, "''");
    conditions.push(`(p.name ILIKE '%${term}%' OR p.brand ILIKE '%${term}%')`);
  }
  if (opts?.stockFilter === "in_stock") {
    conditions.push(`p.stock_status = 'in_stock'`);
  } else if (opts?.stockFilter === "out_of_stock") {
    conditions.push(`p.stock_status = 'out_of_stock'`);
  }

  const limit = opts?.limit || 100;
  const offset = opts?.offset || 0;

  const query = `
    SELECT
      p.id, p.name, p.slug, p.brand, p.price, p.stock_status,
      p.is_featured, p.is_new,
      ph.url as photo_url, ph.alt_text as photo_alt,
      c.name as category_name,
      sc.name as subcategory_name, sc.slug as subcategory_slug
    FROM catalog_products p
    LEFT JOIN catalog_product_photos ph ON ph.product_id = p.id AND ph.is_primary = true
    LEFT JOIN catalog_categories c ON c.id = p.category_id
    LEFT JOIN catalog_product_subcategories ps ON ps.product_id = p.id
    LEFT JOIN catalog_subcategories sc ON sc.id = ps.subcategory_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.stock_status ASC, p.sort_order ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const result = await db.execute(sql.raw(query));
  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    brand: r.brand,
    price: r.price,
    stockStatus: r.stock_status,
    isFeatured: r.is_featured,
    isNew: r.is_new,
    photoUrl: r.photo_url,
    photoAlt: r.photo_alt,
    categoryName: r.category_name,
    subcategoryName: r.subcategory_name,
    subcategorySlug: r.subcategory_slug,
  }));
}

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export async function getSubcategories(): Promise<Subcategory[]> {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT sc.id, sc.name, sc.slug,
      COUNT(DISTINCT ps.product_id) as product_count
    FROM catalog_subcategories sc
    LEFT JOIN catalog_product_subcategories ps ON ps.subcategory_id = sc.id
    LEFT JOIN catalog_products p ON p.id = ps.product_id AND p.deleted_at IS NULL AND p.is_active = true
    WHERE sc.tenant_id = '${tenantId}' AND sc.deleted_at IS NULL
    GROUP BY sc.id, sc.name, sc.slug
    ORDER BY sc.sort_order
  `));
  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    productCount: parseInt(r.product_count || "0"),
  }));
}

export async function getProduct(slug: string): Promise<Product | null> {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT
      p.id, p.name, p.slug, p.brand, p.price, p.stock_status,
      p.is_featured, p.is_new, p.description,
      ph.url as photo_url, ph.alt_text as photo_alt,
      c.name as category_name,
      sc.name as subcategory_name, sc.slug as subcategory_slug
    FROM catalog_products p
    LEFT JOIN catalog_product_photos ph ON ph.product_id = p.id AND ph.is_primary = true
    LEFT JOIN catalog_categories c ON c.id = p.category_id
    LEFT JOIN catalog_product_subcategories ps ON ps.product_id = p.id
    LEFT JOIN catalog_subcategories sc ON sc.id = ps.subcategory_id
    WHERE p.tenant_id = '${tenantId}' AND p.slug = '${slug.replace(/'/g, "''")}' AND p.deleted_at IS NULL
    LIMIT 1
  `));
  if (!result.length) return null;
  const r = result[0] as any;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    brand: r.brand,
    price: r.price,
    stockStatus: r.stock_status,
    isFeatured: r.is_featured,
    isNew: r.is_new,
    photoUrl: r.photo_url,
    photoAlt: r.photo_alt,
    categoryName: r.category_name,
    subcategoryName: r.subcategory_name,
    subcategorySlug: r.subcategory_slug,
  };
}

export async function getProductCount(): Promise<number> {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT COUNT(*) as count FROM catalog_products
    WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL AND is_active = true
  `));
  return parseInt((result[0] as any).count || "0");
}
