import { db } from "./db";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// Cache tenant ID — never changes
let _tenantId: string | null = null;
async function getTenantId(): Promise<string> {
  if (_tenantId) return _tenantId;
  const slug = (process.env.TENANT_SLUG || "nekneks-airsoft").trim();
  const result = await db.execute(
    sql`SELECT id FROM tenants WHERE slug = ${slug} AND is_active = true LIMIT 1`
  );
  if (!result.length) throw new Error(`Tenant ${slug} not found`);
  _tenantId = result[0].id as string;
  return _tenantId;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
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

export interface SubcategoryWithPhoto {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  photoUrl: string | null;
}

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export const getSubcategoriesWithPhotos = unstable_cache(async (): Promise<SubcategoryWithPhoto[]> => {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT sc.id, sc.name, sc.slug,
      COUNT(DISTINCT ps.product_id) as product_count,
      (
        SELECT ph.url FROM catalog_product_photos ph
        JOIN catalog_products p2 ON p2.id = ph.product_id
        JOIN catalog_product_subcategories ps2 ON ps2.product_id = p2.id
        WHERE ps2.subcategory_id = sc.id AND ph.is_primary = true
          AND p2.deleted_at IS NULL AND p2.is_active = true
          AND p2.stock_status = 'in_stock'
        ORDER BY p2.is_featured DESC, p2.sort_order ASC
        LIMIT 1
      ) as photo_url
    FROM catalog_subcategories sc
    LEFT JOIN catalog_product_subcategories ps ON ps.subcategory_id = sc.id
    LEFT JOIN catalog_products p ON p.id = ps.product_id AND p.deleted_at IS NULL AND p.is_active = true
    WHERE sc.tenant_id = '${tenantId}' AND sc.deleted_at IS NULL
    GROUP BY sc.id, sc.name, sc.slug
    HAVING COUNT(DISTINCT ps.product_id) > 0
    ORDER BY sc.sort_order
  `));
  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    productCount: parseInt(r.product_count || "0"),
    photoUrl: r.photo_url,
  }));
}, ["subcategories-with-photos"], { revalidate: 300 });

export async function getProducts(opts?: {
  subcategorySlug?: string;
  search?: string;
  stockFilter?: string;
  brand?: string;
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
      `ps.subcategory_id IN (SELECT id FROM catalog_subcategories WHERE slug = '${opts.subcategorySlug.replace(/'/g, "''")}' AND tenant_id = '${tenantId}')`
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
  if (opts?.brand) {
    conditions.push(`p.brand = '${opts.brand.replace(/'/g, "''")}'`);
  }

  const limit = opts?.limit || 100;
  const offset = opts?.offset || 0;

  const query = `
    SELECT DISTINCT ON (p.id)
      p.id, p.name, p.slug, p.brand, p.price, p.stock_status, p.description,
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
    ORDER BY p.id, p.stock_status ASC, p.is_featured DESC, p.sort_order ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const result = await db.execute(sql.raw(query));
  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    brand: r.brand,
    description: r.description || null,
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

export const getSubcategories = unstable_cache(async (): Promise<Subcategory[]> => {
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
}, ["subcategories"], { revalidate: 300 });

export async function getBrandsForSubcategory(subcategorySlug: string): Promise<{ brand: string; count: number }[]> {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT p.brand, COUNT(*) as cnt
    FROM catalog_products p
    JOIN catalog_product_subcategories ps ON ps.product_id = p.id
    JOIN catalog_subcategories sc ON sc.id = ps.subcategory_id
    WHERE p.tenant_id = '${tenantId}'
      AND p.deleted_at IS NULL AND p.is_active = true
      AND p.brand IS NOT NULL
      AND sc.slug = '${subcategorySlug.replace(/'/g, "''")}'
    GROUP BY p.brand
    ORDER BY cnt DESC
  `));
  return result.map((r: any) => ({
    brand: r.brand,
    count: parseInt(r.cnt),
  }));
}

export async function getProduct(slug: string): Promise<(Product & { allPhotos: { url: string; alt: string | null }[] }) | null> {
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

  // Get all photos
  const photos = await db.execute(sql.raw(`
    SELECT url, alt_text FROM catalog_product_photos
    WHERE product_id = '${r.id}'
    ORDER BY is_primary DESC, sort_order ASC
  `));

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    brand: r.brand,
    description: r.description || null,
    price: r.price,
    stockStatus: r.stock_status,
    isFeatured: r.is_featured,
    isNew: r.is_new,
    photoUrl: r.photo_url,
    photoAlt: r.photo_alt,
    categoryName: r.category_name,
    subcategoryName: r.subcategory_name,
    subcategorySlug: r.subcategory_slug,
    allPhotos: photos.map((p: any) => ({ url: p.url, alt: p.alt_text })),
  };
}

export async function getRelatedProducts(subcategorySlug: string, excludeSlug: string, limit = 8): Promise<Product[]> {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT DISTINCT ON (p.id)
      p.id, p.name, p.slug, p.brand, p.price, p.stock_status, p.description,
      p.is_featured, p.is_new,
      ph.url as photo_url, ph.alt_text as photo_alt,
      c.name as category_name,
      sc.name as subcategory_name, sc.slug as subcategory_slug
    FROM catalog_products p
    LEFT JOIN catalog_product_photos ph ON ph.product_id = p.id AND ph.is_primary = true
    LEFT JOIN catalog_categories c ON c.id = p.category_id
    JOIN catalog_product_subcategories ps ON ps.product_id = p.id
    JOIN catalog_subcategories sc ON sc.id = ps.subcategory_id
    WHERE p.tenant_id = '${tenantId}'
      AND p.deleted_at IS NULL AND p.is_active = true
      AND sc.slug = '${subcategorySlug.replace(/'/g, "''")}'
      AND p.slug != '${excludeSlug.replace(/'/g, "''")}'
    ORDER BY p.id, p.stock_status ASC, RANDOM()
    LIMIT ${limit}
  `));
  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    brand: r.brand,
    description: r.description || null,
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

export const getProductCount = unstable_cache(async (): Promise<number> => {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT COUNT(*) as count FROM catalog_products
    WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL AND is_active = true
  `));
  return parseInt((result[0] as any).count || "0");
}, ["product-count"], { revalidate: 300 });

export const getAllBrands = unstable_cache(async (): Promise<{ brand: string; count: number }[]> => {
  const tenantId = await getTenantId();
  const result = await db.execute(sql.raw(`
    SELECT brand, COUNT(*) as cnt
    FROM catalog_products
    WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL AND is_active = true AND brand IS NOT NULL
    GROUP BY brand ORDER BY cnt DESC
  `));
  return result.map((r: any) => ({ brand: r.brand, count: parseInt(r.cnt) }));
}, ["all-brands"], { revalidate: 300 });
