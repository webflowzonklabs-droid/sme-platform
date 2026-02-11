import { TRPCError } from "@trpc/server";
import { eq, and, isNull, desc, asc, ilike, sql, inArray, gt, count, ne } from "drizzle-orm";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/procedures";
import { requirePermission, requireModule } from "../../trpc/procedures";
import { createAuditLog } from "../../audit/index";
import { paginationSchema, paginatedResult } from "@sme/shared";
import {
  catalogCategories,
  catalogSubcategories,
  catalogProducts,
  catalogProductSubcategories,
  catalogProductPhotos,
  catalogAttributeDefinitions,
  catalogProductAttributes,
} from "./schema";

// ============================================
// Helpers
// ============================================
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PRICE_REGEX = /^\d{1,10}(\.\d{1,2})?$/;

const stockStatuses = ["in_stock", "out_of_stock", "pre_order", "reserved"] as const;
const attributeTypes = ["text", "number", "boolean", "select"] as const;

// Base procedure — requires catalog module enabled
const catalogProcedure = tenantProcedure.use(requireModule("catalog"));

// ============================================
// Slug uniqueness helper
// ============================================
async function ensureSlugUnique(
  db: any,
  table: any,
  tenantId: string,
  slug: string,
  excludeId?: string,
  useSoftDelete = true,
) {
  const conditions: any[] = [
    eq(table.tenantId, tenantId),
    eq(table.slug, slug),
  ];
  if (useSoftDelete) {
    conditions.push(isNull(table.deletedAt));
  }
  if (excludeId) {
    conditions.push(ne(table.id, excludeId));
  }
  const [existing] = await db.select({ id: table.id }).from(table).where(and(...conditions)).limit(1);
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: `A record with slug "${slug}" already exists` });
  }
}

// ============================================
// Attribute value validation helper
// ============================================
async function validateAttributeValues(
  db: any,
  tenantId: string,
  values: { attributeDefinitionId: string; value: string }[],
) {
  if (values.length === 0) return;

  const defIds = values.map((v) => v.attributeDefinitionId);
  const defs = await db
    .select({
      id: catalogAttributeDefinitions.id,
      name: catalogAttributeDefinitions.name,
      type: catalogAttributeDefinitions.type,
      options: catalogAttributeDefinitions.options,
    })
    .from(catalogAttributeDefinitions)
    .where(
      and(
        inArray(catalogAttributeDefinitions.id, defIds),
        eq(catalogAttributeDefinitions.tenantId, tenantId),
      ),
    );

  const defMap = new Map<string, { id: string; name: string; type: string; options: string[] | null }>(
    defs.map((d: any) => [d.id, d]),
  );

  for (const v of values) {
    const def = defMap.get(v.attributeDefinitionId);
    if (!def) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Attribute definition "${v.attributeDefinitionId}" not found`,
      });
    }
    switch (def.type) {
      case "text":
        if (v.value.length > 1000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Attribute "${def.name}" value exceeds 1000 characters`,
          });
        }
        break;
      case "number":
        if (isNaN(Number(v.value)) || v.value.trim() === "") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Attribute "${def.name}" must be a valid number`,
          });
        }
        break;
      case "boolean":
        if (v.value !== "true" && v.value !== "false") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Attribute "${def.name}" must be "true" or "false"`,
          });
        }
        break;
      case "select": {
        const options: string[] = def.options ?? [];
        if (!options.includes(v.value)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Attribute "${def.name}" must be one of: ${options.join(", ")}`,
          });
        }
        break;
      }
    }
  }
}

// ============================================
// Categories Router
// ============================================
const categoriesRouter = router({
  list: catalogProcedure
    .use(requirePermission("catalog:categories:read"))
    .query(async ({ ctx }) => {
      const cats = await ctx.db
        .select({
          id: catalogCategories.id,
          tenantId: catalogCategories.tenantId,
          name: catalogCategories.name,
          slug: catalogCategories.slug,
          description: catalogCategories.description,
          sortOrder: catalogCategories.sortOrder,
          isActive: catalogCategories.isActive,
          createdAt: catalogCategories.createdAt,
          updatedAt: catalogCategories.updatedAt,
          productCount: sql<number>`(
            SELECT count(*)::int FROM catalog_products
            WHERE category_id = ${catalogCategories.id}
            AND tenant_id = ${ctx.tenantId}
            AND deleted_at IS NULL
          )`.as("product_count"),
        })
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.tenantId, ctx.tenantId),
            isNull(catalogCategories.deletedAt)
          )
        )
        .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name));

      return cats;
    }),

  get: catalogProcedure
    .use(requirePermission("catalog:categories:read"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [cat] = await ctx.db
        .select()
        .from(catalogCategories)
        .where(
          and(
            eq(catalogCategories.id, input.id),
            eq(catalogCategories.tenantId, ctx.tenantId),
            isNull(catalogCategories.deletedAt)
          )
        )
        .limit(1);

      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      return cat;
    }),

  create: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const slug = input.slug || slugify(input.name);

      // H3: Slug uniqueness
      await ensureSlugUnique(ctx.db, catalogCategories, ctx.tenantId, slug);

      const [cat] = await ctx.db
        .insert(catalogCategories)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          slug,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        })
        .returning();

      if (!cat) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create category" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:category:created",
        resourceType: "catalog_category",
        resourceId: cat.id,
        changes: { after: { name: input.name, slug } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return cat;
    }),

  update: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().nullable().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.slug !== undefined) updateData.slug = updates.slug;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      // H3: Slug uniqueness on update
      if (updates.slug !== undefined) {
        await ensureSlugUnique(ctx.db, catalogCategories, ctx.tenantId, updates.slug, id);
      }

      const [updated] = await ctx.db
        .update(catalogCategories)
        .set(updateData)
        .where(and(
          eq(catalogCategories.id, id),
          eq(catalogCategories.tenantId, ctx.tenantId),
          isNull(catalogCategories.deletedAt)
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:category:updated",
        resourceType: "catalog_category",
        resourceId: id,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return updated;
    }),

  delete: catalogProcedure
    .use(requirePermission("catalog:categories:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .update(catalogCategories)
        .set({ deletedAt: new Date(), deletedBy: ctx.session!.user.id })
        .where(and(
          eq(catalogCategories.id, input.id),
          eq(catalogCategories.tenantId, ctx.tenantId),
          isNull(catalogCategories.deletedAt)
        ))
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:category:deleted",
        resourceType: "catalog_category",
        resourceId: input.id,
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),

  reorder: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      for (const item of input.items) {
        await ctx.db
          .update(catalogCategories)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(and(
            eq(catalogCategories.id, item.id),
            eq(catalogCategories.tenantId, ctx.tenantId),
            isNull(catalogCategories.deletedAt)
          ));
      }
      return { success: true };
    }),
});

// ============================================
// Subcategories Router
// ============================================
const subcategoriesRouter = router({
  list: catalogProcedure
    .use(requirePermission("catalog:categories:read"))
    .input(z.object({ categoryId: z.string().uuid().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const conditions = [
        eq(catalogSubcategories.tenantId, ctx.tenantId),
        isNull(catalogSubcategories.deletedAt),
      ];
      if (input?.categoryId) {
        conditions.push(eq(catalogSubcategories.categoryId, input.categoryId));
      }

      return ctx.db
        .select()
        .from(catalogSubcategories)
        .where(and(...conditions))
        .orderBy(asc(catalogSubcategories.sortOrder), asc(catalogSubcategories.name));
    }),

  create: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      categoryId: z.string().uuid(),
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify category belongs to tenant
      const [cat] = await ctx.db.select({ id: catalogCategories.id })
        .from(catalogCategories)
        .where(and(
          eq(catalogCategories.id, input.categoryId),
          eq(catalogCategories.tenantId, ctx.tenantId),
          isNull(catalogCategories.deletedAt)
        )).limit(1);
      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

      const slug = input.slug || slugify(input.name);

      // H3: Slug uniqueness
      await ensureSlugUnique(ctx.db, catalogSubcategories, ctx.tenantId, slug);

      const [sub] = await ctx.db
        .insert(catalogSubcategories)
        .values({
          tenantId: ctx.tenantId,
          categoryId: input.categoryId,
          name: input.name,
          slug,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        })
        .returning();

      if (!sub) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create subcategory" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:subcategory:created",
        resourceType: "catalog_subcategory",
        resourceId: sub.id,
        changes: { after: { name: input.name, categoryId: input.categoryId } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return sub;
    }),

  update: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      description: z.string().nullable().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.slug !== undefined) updateData.slug = updates.slug;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      // H3: Slug uniqueness on update
      if (updates.slug !== undefined) {
        await ensureSlugUnique(ctx.db, catalogSubcategories, ctx.tenantId, updates.slug, id);
      }

      const [updated] = await ctx.db
        .update(catalogSubcategories)
        .set(updateData)
        .where(and(
          eq(catalogSubcategories.id, id),
          eq(catalogSubcategories.tenantId, ctx.tenantId),
          isNull(catalogSubcategories.deletedAt)
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Subcategory not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:subcategory:updated",
        resourceType: "catalog_subcategory",
        resourceId: id,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return updated;
    }),

  delete: catalogProcedure
    .use(requirePermission("catalog:categories:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .update(catalogSubcategories)
        .set({ deletedAt: new Date(), deletedBy: ctx.session!.user.id })
        .where(and(
          eq(catalogSubcategories.id, input.id),
          eq(catalogSubcategories.tenantId, ctx.tenantId),
          isNull(catalogSubcategories.deletedAt)
        ))
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Subcategory not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:subcategory:deleted",
        resourceType: "catalog_subcategory",
        resourceId: input.id,
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),

  reorder: catalogProcedure
    .use(requirePermission("catalog:categories:write"))
    .input(z.object({
      items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      for (const item of input.items) {
        await ctx.db
          .update(catalogSubcategories)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(and(
            eq(catalogSubcategories.id, item.id),
            eq(catalogSubcategories.tenantId, ctx.tenantId),
            isNull(catalogSubcategories.deletedAt)
          ));
      }
      return { success: true };
    }),
});

// ============================================
// Products Router
// ============================================
const productsRouter = router({
  list: catalogProcedure
    .use(requirePermission("catalog:products:read"))
    .input(paginationSchema.extend({
      search: z.string().optional(),
      categoryId: z.string().uuid().optional(),
      subcategoryId: z.string().uuid().optional(),
      stockStatus: z.enum(stockStatuses).optional(),
      isFeatured: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [
        eq(catalogProducts.tenantId, ctx.tenantId),
        isNull(catalogProducts.deletedAt),
      ];

      if (input.search) {
        conditions.push(ilike(catalogProducts.name, `%${escapeLike(input.search)}%`));
      }
      if (input.categoryId) {
        conditions.push(eq(catalogProducts.categoryId, input.categoryId));
      }
      if (input.stockStatus) {
        conditions.push(eq(catalogProducts.stockStatus, input.stockStatus));
      }
      if (input.isFeatured !== undefined) {
        conditions.push(eq(catalogProducts.isFeatured, input.isFeatured));
      }
      if (input.isActive !== undefined) {
        conditions.push(eq(catalogProducts.isActive, input.isActive));
      }
      if (input.cursor) {
        conditions.push(gt(catalogProducts.id, input.cursor));
      }

      // If filtering by subcategory, verify it belongs to tenant first (H2)
      if (input.subcategoryId) {
        const [sub] = await ctx.db
          .select({ id: catalogSubcategories.id })
          .from(catalogSubcategories)
          .where(and(
            eq(catalogSubcategories.id, input.subcategoryId),
            eq(catalogSubcategories.tenantId, ctx.tenantId),
            isNull(catalogSubcategories.deletedAt)
          ))
          .limit(1);

        if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcategory not found" });

        const productIds = await ctx.db
          .select({ productId: catalogProductSubcategories.productId })
          .from(catalogProductSubcategories)
          .where(eq(catalogProductSubcategories.subcategoryId, input.subcategoryId));

        const ids = productIds.map((r) => r.productId);
        if (ids.length === 0) return { data: [], nextCursor: null, hasMore: false };
        conditions.push(inArray(catalogProducts.id, ids));
      }

      const items = await ctx.db
        .select()
        .from(catalogProducts)
        .where(and(...conditions))
        .orderBy(asc(catalogProducts.sortOrder), desc(catalogProducts.createdAt))
        .limit(input.limit + 1);

      return paginatedResult(items, input.limit);
    }),

  get: catalogProcedure
    .use(requirePermission("catalog:products:read"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [product] = await ctx.db
        .select()
        .from(catalogProducts)
        .where(and(
          eq(catalogProducts.id, input.id),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        ))
        .limit(1);

      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      // Fetch related data in parallel (M3: add tenant filters)
      const [photos, subcategoryLinks, attributes] = await Promise.all([
        ctx.db.select().from(catalogProductPhotos)
          .where(and(
            eq(catalogProductPhotos.productId, product.id),
            eq(catalogProductPhotos.tenantId, ctx.tenantId),
          ))
          .orderBy(asc(catalogProductPhotos.sortOrder)),
        ctx.db.select().from(catalogProductSubcategories)
          .innerJoin(
            catalogSubcategories,
            and(
              eq(catalogProductSubcategories.subcategoryId, catalogSubcategories.id),
              eq(catalogSubcategories.tenantId, ctx.tenantId),
            )
          )
          .where(eq(catalogProductSubcategories.productId, product.id)),
        ctx.db.select({
          id: catalogProductAttributes.id,
          productId: catalogProductAttributes.productId,
          attributeDefinitionId: catalogProductAttributes.attributeDefinitionId,
          value: catalogProductAttributes.value,
          createdAt: catalogProductAttributes.createdAt,
          definitionName: catalogAttributeDefinitions.name,
          definitionSlug: catalogAttributeDefinitions.slug,
          definitionType: catalogAttributeDefinitions.type,
        })
          .from(catalogProductAttributes)
          .innerJoin(
            catalogAttributeDefinitions,
            and(
              eq(catalogProductAttributes.attributeDefinitionId, catalogAttributeDefinitions.id),
              eq(catalogAttributeDefinitions.tenantId, ctx.tenantId),
            )
          )
          .where(eq(catalogProductAttributes.productId, product.id)),
      ]);

      return {
        ...product,
        photos,
        subcategoryIds: subcategoryLinks.map((l) => l.catalog_product_subcategories.subcategoryId),
        attributes,
      };
    }),

  create: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({
      name: z.string().min(1).max(300),
      slug: z.string().min(1).max(300).optional(),
      brand: z.string().max(200).optional(),
      description: z.string().optional(),
      price: z.string().regex(PRICE_REGEX, "Price must be a valid non-negative number (up to 10 digits, 2 decimal places)").optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      categoryId: z.string().uuid(),
      stockStatus: z.enum(stockStatuses).optional(),
      isFeatured: z.boolean().optional(),
      isNew: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      subcategoryIds: z.array(z.string().uuid()).optional(),
      attributes: z.array(z.object({
        attributeDefinitionId: z.string().uuid(),
        value: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify category belongs to tenant
      const [cat] = await ctx.db.select({ id: catalogCategories.id })
        .from(catalogCategories)
        .where(and(
          eq(catalogCategories.id, input.categoryId),
          eq(catalogCategories.tenantId, ctx.tenantId),
          isNull(catalogCategories.deletedAt)
        )).limit(1);
      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });

      const slug = input.slug || slugify(input.name);

      // H3: Slug uniqueness
      await ensureSlugUnique(ctx.db, catalogProducts, ctx.tenantId, slug);

      // H4: Validate attribute values against types
      if (input.attributes && input.attributes.length > 0) {
        await validateAttributeValues(ctx.db, ctx.tenantId, input.attributes);
      }

      const [product] = await ctx.db
        .insert(catalogProducts)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          slug,
          brand: input.brand ?? null,
          description: input.description ?? null,
          price: input.price ?? null,
          currency: input.currency ?? "PHP",
          categoryId: input.categoryId,
          stockStatus: input.stockStatus ?? "in_stock",
          isFeatured: input.isFeatured ?? false,
          isNew: input.isNew ?? false,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();

      if (!product) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create product" });

      // Insert subcategory links
      if (input.subcategoryIds && input.subcategoryIds.length > 0) {
        // Verify all subcategories belong to tenant
        const validSubs = await ctx.db.select({ id: catalogSubcategories.id })
          .from(catalogSubcategories)
          .where(and(
            inArray(catalogSubcategories.id, input.subcategoryIds),
            eq(catalogSubcategories.tenantId, ctx.tenantId),
            isNull(catalogSubcategories.deletedAt)
          ));
        const validIds = new Set(validSubs.map((s: any) => s.id));

        const links = input.subcategoryIds
          .filter((id) => validIds.has(id))
          .map((subcategoryId) => ({ productId: product.id, subcategoryId }));

        if (links.length > 0) {
          await ctx.db.insert(catalogProductSubcategories).values(links);
        }
      }

      // Insert attribute values (already validated above)
      if (input.attributes && input.attributes.length > 0) {
        const defIds = input.attributes.map((a) => a.attributeDefinitionId);
        const validDefs = await ctx.db.select({ id: catalogAttributeDefinitions.id })
          .from(catalogAttributeDefinitions)
          .where(and(
            inArray(catalogAttributeDefinitions.id, defIds),
            eq(catalogAttributeDefinitions.tenantId, ctx.tenantId)
          ));
        const validDefIds = new Set(validDefs.map((d: any) => d.id));

        const attrs = input.attributes
          .filter((a) => validDefIds.has(a.attributeDefinitionId))
          .map((a) => ({
            productId: product.id,
            attributeDefinitionId: a.attributeDefinitionId,
            value: a.value,
          }));

        if (attrs.length > 0) {
          await ctx.db.insert(catalogProductAttributes).values(attrs);
        }
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:product:created",
        resourceType: "catalog_product",
        resourceId: product.id,
        changes: { after: { name: input.name, slug, categoryId: input.categoryId } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return product;
    }),

  update: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(300).optional(),
      slug: z.string().min(1).max(300).optional(),
      brand: z.string().max(200).nullable().optional(),
      description: z.string().nullable().optional(),
      price: z.string().regex(PRICE_REGEX, "Price must be a valid non-negative number (up to 10 digits, 2 decimal places)").nullable().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      categoryId: z.string().uuid().optional(),
      stockStatus: z.enum(stockStatuses).optional(),
      isFeatured: z.boolean().optional(),
      isNew: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      subcategoryIds: z.array(z.string().uuid()).optional(),
      attributes: z.array(z.object({
        attributeDefinitionId: z.string().uuid(),
        value: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, subcategoryIds, attributes, ...updates } = input;

      // Verify product belongs to tenant
      const [existing] = await ctx.db.select({ id: catalogProducts.id })
        .from(catalogProducts)
        .where(and(
          eq(catalogProducts.id, id),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        )).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      // If changing category, verify it belongs to tenant
      if (updates.categoryId) {
        const [cat] = await ctx.db.select({ id: catalogCategories.id })
          .from(catalogCategories)
          .where(and(
            eq(catalogCategories.id, updates.categoryId),
            eq(catalogCategories.tenantId, ctx.tenantId),
            isNull(catalogCategories.deletedAt)
          )).limit(1);
        if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      }

      // H3: Slug uniqueness on update
      if (updates.slug !== undefined) {
        await ensureSlugUnique(ctx.db, catalogProducts, ctx.tenantId, updates.slug, id);
      }

      // H4: Validate attribute values against types
      if (attributes && attributes.length > 0) {
        await validateAttributeValues(ctx.db, ctx.tenantId, attributes);
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) updateData[key] = value;
      }

      const [updated] = await ctx.db
        .update(catalogProducts)
        .set(updateData)
        .where(and(
          eq(catalogProducts.id, id),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      // Replace subcategory links if provided
      if (subcategoryIds !== undefined) {
        await ctx.db.delete(catalogProductSubcategories)
          .where(eq(catalogProductSubcategories.productId, id));

        if (subcategoryIds.length > 0) {
          const validSubs = await ctx.db.select({ id: catalogSubcategories.id })
            .from(catalogSubcategories)
            .where(and(
              inArray(catalogSubcategories.id, subcategoryIds),
              eq(catalogSubcategories.tenantId, ctx.tenantId),
              isNull(catalogSubcategories.deletedAt)
            ));
          const validIds = new Set(validSubs.map((s: any) => s.id));

          const links = subcategoryIds
            .filter((sid) => validIds.has(sid))
            .map((subcategoryId) => ({ productId: id, subcategoryId }));

          if (links.length > 0) {
            await ctx.db.insert(catalogProductSubcategories).values(links);
          }
        }
      }

      // Replace attribute values if provided (already validated above)
      if (attributes !== undefined) {
        await ctx.db.delete(catalogProductAttributes)
          .where(eq(catalogProductAttributes.productId, id));

        if (attributes.length > 0) {
          const defIds = attributes.map((a) => a.attributeDefinitionId);
          const validDefs = await ctx.db.select({ id: catalogAttributeDefinitions.id })
            .from(catalogAttributeDefinitions)
            .where(and(
              inArray(catalogAttributeDefinitions.id, defIds),
              eq(catalogAttributeDefinitions.tenantId, ctx.tenantId)
            ));
          const validDefIds = new Set(validDefs.map((d: any) => d.id));

          const attrs = attributes
            .filter((a) => validDefIds.has(a.attributeDefinitionId))
            .map((a) => ({
              productId: id,
              attributeDefinitionId: a.attributeDefinitionId,
              value: a.value,
            }));

          if (attrs.length > 0) {
            await ctx.db.insert(catalogProductAttributes).values(attrs);
          }
        }
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:product:updated",
        resourceType: "catalog_product",
        resourceId: id,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return updated;
    }),

  delete: catalogProcedure
    .use(requirePermission("catalog:products:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .update(catalogProducts)
        .set({ deletedAt: new Date(), deletedBy: ctx.session!.user.id })
        .where(and(
          eq(catalogProducts.id, input.id),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        ))
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:product:deleted",
        resourceType: "catalog_product",
        resourceId: input.id,
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),
});

// ============================================
// Photos Router
// ============================================
const photosRouter = router({
  add: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({
      productId: z.string().uuid(),
      url: z.string().url().max(2000).refine(url => url.startsWith('https://'), 'URL must use HTTPS'),
      altText: z.string().max(300).optional(),
      sortOrder: z.number().int().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify product belongs to tenant
      const [product] = await ctx.db.select({ id: catalogProducts.id })
        .from(catalogProducts)
        .where(and(
          eq(catalogProducts.id, input.productId),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        )).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      // If setting as primary, unset other primaries
      if (input.isPrimary) {
        await ctx.db.update(catalogProductPhotos)
          .set({ isPrimary: false })
          .where(eq(catalogProductPhotos.productId, input.productId));
      }

      const [photo] = await ctx.db
        .insert(catalogProductPhotos)
        .values({
          tenantId: ctx.tenantId,
          productId: input.productId,
          url: input.url,
          altText: input.altText ?? null,
          sortOrder: input.sortOrder ?? 0,
          isPrimary: input.isPrimary ?? false,
        })
        .returning();

      if (!photo) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add photo" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:photo:added",
        resourceType: "catalog_product_photo",
        resourceId: photo.id,
        changes: { after: { productId: input.productId, url: input.url } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return photo;
    }),

  remove: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .delete(catalogProductPhotos)
        .where(and(
          eq(catalogProductPhotos.id, input.id),
          eq(catalogProductPhotos.tenantId, ctx.tenantId)
        ))
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:photo:removed",
        resourceType: "catalog_product_photo",
        resourceId: input.id,
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),

  reorder: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({
      items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      for (const item of input.items) {
        await ctx.db.update(catalogProductPhotos)
          .set({ sortOrder: item.sortOrder })
          .where(and(
            eq(catalogProductPhotos.id, item.id),
            eq(catalogProductPhotos.tenantId, ctx.tenantId)
          ));
      }
      return { success: true };
    }),

  setPrimary: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Get the photo to find its product
      const [photo] = await ctx.db.select()
        .from(catalogProductPhotos)
        .where(and(
          eq(catalogProductPhotos.id, input.id),
          eq(catalogProductPhotos.tenantId, ctx.tenantId)
        )).limit(1);

      if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });

      // Unset all primaries for this product, then set the requested one
      await ctx.db.update(catalogProductPhotos)
        .set({ isPrimary: false })
        .where(eq(catalogProductPhotos.productId, photo.productId));

      await ctx.db.update(catalogProductPhotos)
        .set({ isPrimary: true })
        .where(and(
          eq(catalogProductPhotos.id, input.id),
          eq(catalogProductPhotos.tenantId, ctx.tenantId)
        ));

      return { success: true };
    }),
});

// ============================================
// Attributes Router
// ============================================
const attributesRouter = router({
  list: catalogProcedure
    .use(requirePermission("catalog:attributes:read"))
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(catalogAttributeDefinitions)
        .where(eq(catalogAttributeDefinitions.tenantId, ctx.tenantId))
        .orderBy(asc(catalogAttributeDefinitions.sortOrder), asc(catalogAttributeDefinitions.name));
    }),

  define: catalogProcedure
    .use(requirePermission("catalog:attributes:write"))
    .input(z.object({
      name: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).optional(),
      type: z.enum(attributeTypes),
      options: z.array(z.string()).optional(),
      isRequired: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const slug = input.slug || slugify(input.name);

      // H3: Slug uniqueness (attribute definitions don't have soft delete)
      await ensureSlugUnique(ctx.db, catalogAttributeDefinitions, ctx.tenantId, slug, undefined, false);

      const [def] = await ctx.db
        .insert(catalogAttributeDefinitions)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          slug,
          type: input.type,
          options: input.type === "select" ? (input.options ?? []) : null,
          isRequired: input.isRequired ?? false,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();

      if (!def) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create attribute definition" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:attribute:defined",
        resourceType: "catalog_attribute_definition",
        resourceId: def.id,
        changes: { after: { name: input.name, type: input.type } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return def;
    }),

  update: catalogProcedure
    .use(requirePermission("catalog:attributes:write"))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      slug: z.string().min(1).max(200).optional(),
      type: z.enum(attributeTypes).optional(),
      options: z.array(z.string()).nullable().optional(),
      isRequired: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.slug !== undefined) updateData.slug = updates.slug;
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.options !== undefined) updateData.options = updates.options;
      if (updates.isRequired !== undefined) updateData.isRequired = updates.isRequired;
      if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;

      // H3: Slug uniqueness on update (no soft delete on this table)
      if (updates.slug !== undefined) {
        await ensureSlugUnique(ctx.db, catalogAttributeDefinitions, ctx.tenantId, updates.slug, id, false);
      }

      const [updated] = await ctx.db
        .update(catalogAttributeDefinitions)
        .set(updateData)
        .where(and(
          eq(catalogAttributeDefinitions.id, id),
          eq(catalogAttributeDefinitions.tenantId, ctx.tenantId)
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Attribute definition not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:attribute:updated",
        resourceType: "catalog_attribute_definition",
        resourceId: id,
        changes: { after: updateData },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return updated;
    }),

  delete: catalogProcedure
    .use(requirePermission("catalog:attributes:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // C1: Verify ownership FIRST, then delete (FK CASCADE handles attribute values)
      const [deleted] = await ctx.db
        .delete(catalogAttributeDefinitions)
        .where(and(
          eq(catalogAttributeDefinitions.id, input.id),
          eq(catalogAttributeDefinitions.tenantId, ctx.tenantId)
        ))
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Attribute definition not found" });

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:attribute:deleted",
        resourceType: "catalog_attribute_definition",
        resourceId: input.id,
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),

  setValues: catalogProcedure
    .use(requirePermission("catalog:products:write"))
    .input(z.object({
      productId: z.string().uuid(),
      values: z.array(z.object({
        attributeDefinitionId: z.string().uuid(),
        value: z.string(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify product belongs to tenant
      const [product] = await ctx.db.select({ id: catalogProducts.id })
        .from(catalogProducts)
        .where(and(
          eq(catalogProducts.id, input.productId),
          eq(catalogProducts.tenantId, ctx.tenantId),
          isNull(catalogProducts.deletedAt)
        )).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });

      // H4: Validate attribute values against definition types
      if (input.values.length > 0) {
        await validateAttributeValues(ctx.db, ctx.tenantId, input.values);

        // Remove existing values for this product
        await ctx.db.delete(catalogProductAttributes)
          .where(eq(catalogProductAttributes.productId, input.productId));

        // Insert new values (validateAttributeValues already confirmed they belong to tenant)
        const attrs = input.values.map((v) => ({
          productId: input.productId,
          attributeDefinitionId: v.attributeDefinitionId,
          value: v.value,
        }));

        await ctx.db.insert(catalogProductAttributes).values(attrs);
      } else {
        // Empty values array = clear all attributes
        await ctx.db.delete(catalogProductAttributes)
          .where(eq(catalogProductAttributes.productId, input.productId));
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session!.user.id,
        action: "catalog:attribute:values_set",
        resourceType: "catalog_product",
        resourceId: input.productId,
        changes: { after: { attributeCount: input.values.length } },
        ipAddress: ctx.ipAddress,
      }, ctx.db);

      return { success: true };
    }),
});

// ============================================
// Combined Catalog Router
// ============================================
export const catalogRouter = router({
  categories: categoriesRouter,
  subcategories: subcategoriesRouter,
  products: productsRouter,
  photos: photosRouter,
  attributes: attributesRouter,
});
