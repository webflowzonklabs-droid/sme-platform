import { TRPCError } from "@trpc/server";
import { eq, and, isNull, desc, asc, ilike, sql, inArray, gte, lte, count } from "drizzle-orm";
import { z } from "zod";
import Decimal from "decimal.js";
import { router, tenantProcedure } from "../../trpc/procedures";
import { requirePermission, requireModule } from "../../trpc/procedures";
import { createAuditLog } from "../../audit/index";
import {
  costingInventoryItems,
  costingPriceHistory,
  costingRecipes,
  costingRecipeIngredients,
  costingSnapshots,
} from "./schema";

// ============================================
// Helpers
// ============================================

const NUMERIC_REGEX = /^\d{1,10}(\.\d{1,4})?$/;
const NUMERIC_6_REGEX = /^\d{1,10}(\.\d{1,6})?$/;
const PRICE_REGEX = /^\d{1,10}(\.\d{1,2})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const unitTypes = ["weight", "piece"] as const;
const recipeTypes = ["base", "final"] as const;
const ingredientTypes = ["raw", "base"] as const;

// Base procedure — requires costing module enabled
const costingProcedure = tenantProcedure.use(requireModule("costing"));

/**
 * Get the latest price_per_unit for an inventory item.
 */
async function getLatestPricePerUnit(
  db: any,
  tenantId: string,
  itemId: string
): Promise<string | null> {
  const [latest] = await db
    .select({ pricePerUnit: costingPriceHistory.pricePerUnit })
    .from(costingPriceHistory)
    .where(
      and(
        eq(costingPriceHistory.itemId, itemId),
        eq(costingPriceHistory.tenantId, tenantId)
      )
    )
    .orderBy(desc(costingPriceHistory.effectiveDate), desc(costingPriceHistory.createdAt))
    .limit(1);
  return latest?.pricePerUnit ?? null;
}

/**
 * Auto-create a snapshot of a recipe's current state.
 */
async function autoSnapshot(
  db: any,
  tenantId: string,
  recipeId: string,
  notes: string
): Promise<void> {
  const [recipe] = await db
    .select()
    .from(costingRecipes)
    .where(
      and(
        eq(costingRecipes.id, recipeId),
        eq(costingRecipes.tenantId, tenantId),
        isNull(costingRecipes.deletedAt)
      )
    )
    .limit(1);

  if (!recipe) return;

  const ingredients = await db
    .select()
    .from(costingRecipeIngredients)
    .where(eq(costingRecipeIngredients.recipeId, recipeId))
    .orderBy(asc(costingRecipeIngredients.sortOrder));

  await db.insert(costingSnapshots).values({
    tenantId,
    recipeId,
    totalCost: recipe.totalCost ?? "0",
    costPerGram: recipe.costPerGram,
    cogsPct: recipe.cogsPct,
    ingredientCosts: ingredients.map((ing: any) => ({
      id: ing.id,
      ingredientType: ing.ingredientType,
      inventoryItemId: ing.inventoryItemId,
      baseRecipeId: ing.baseRecipeId,
      amount: ing.amount,
      unitCost: ing.unitCost,
      extendedCost: ing.extendedCost,
    })),
    notes,
  });
}

/**
 * Recalculate a recipe's costs based on its ingredients.
 * Uses Decimal.js for all financial arithmetic.
 */
async function recalculateRecipeCosts(
  db: any,
  tenantId: string,
  recipeId: string
): Promise<any> {
  // Fetch recipe
  const [recipe] = await db
    .select()
    .from(costingRecipes)
    .where(
      and(
        eq(costingRecipes.id, recipeId),
        eq(costingRecipes.tenantId, tenantId),
        isNull(costingRecipes.deletedAt)
      )
    )
    .limit(1);

  if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

  // Fetch ingredients
  const ingredients = await db
    .select()
    .from(costingRecipeIngredients)
    .where(eq(costingRecipeIngredients.recipeId, recipeId))
    .orderBy(asc(costingRecipeIngredients.sortOrder));

  // Update each ingredient's unit cost from current prices
  for (const ing of ingredients) {
    let unitCost = "0";
    if (ing.ingredientType === "raw" && ing.inventoryItemId) {
      const price = await getLatestPricePerUnit(db, tenantId, ing.inventoryItemId);
      unitCost = price ?? "0";
    } else if (ing.ingredientType === "base" && ing.baseRecipeId) {
      const [baseRecipe] = await db
        .select({ costPerGram: costingRecipes.costPerGram })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, ing.baseRecipeId),
            eq(costingRecipes.tenantId, tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);
      unitCost = baseRecipe?.costPerGram ?? "0";
    }

    const extendedCost = new Decimal(ing.amount).mul(unitCost).toFixed(4);

    await db
      .update(costingRecipeIngredients)
      .set({ unitCost, extendedCost })
      .where(eq(costingRecipeIngredients.id, ing.id));
  }

  // Recalculate recipe totals
  const updatedIngredients = await db
    .select()
    .from(costingRecipeIngredients)
    .where(eq(costingRecipeIngredients.recipeId, recipeId));

  let totalCost = new Decimal(0);
  let rawWeight = new Decimal(0);
  for (const i of updatedIngredients) {
    totalCost = totalCost.plus(i.extendedCost);
    rawWeight = rawWeight.plus(i.amount);
  }

  const yieldLoss = new Decimal(recipe.yieldLossPct || 0).div(100);
  const netWeight = rawWeight.mul(new Decimal(1).minus(yieldLoss));

  const updateData: Record<string, unknown> = {
    totalCost: totalCost.toFixed(4),
    rawWeight: rawWeight.toFixed(4),
    netWeight: netWeight.toFixed(4),
    updatedAt: new Date(),
  };

  if (netWeight.gt(0)) {
    updateData.costPerGram = totalCost.div(netWeight).toFixed(6);
  }

  // For final products, calculate COGS%
  if (recipe.type === "final" && recipe.sellingPrice) {
    const sp = new Decimal(recipe.sellingPrice);
    if (sp.gt(0)) {
      updateData.cogsPct = totalCost.div(sp).mul(100).toFixed(2);
    }
  }

  const [updated] = await db
    .update(costingRecipes)
    .set(updateData)
    .where(
      and(
        eq(costingRecipes.id, recipeId),
        eq(costingRecipes.tenantId, tenantId)
      )
    )
    .returning();

  return updated;
}

// ============================================
// Inventory Items Router
// ============================================
const inventoryRouter = router({
  list: costingProcedure
    .use(requirePermission("costing:view"))
    .input(
      z
        .object({
          search: z.string().optional(),
          category: z.string().optional(),
          isActive: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional().default(50),
          offset: z.number().int().min(0).optional().default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const conditions: any[] = [
        eq(costingInventoryItems.tenantId, ctx.tenantId),
        isNull(costingInventoryItems.deletedAt),
      ];

      if (input?.search) {
        conditions.push(
          ilike(costingInventoryItems.name, `%${input.search.replace(/[%_\\]/g, "\\$&")}%`)
        );
      }
      if (input?.category) {
        conditions.push(eq(costingInventoryItems.category, input.category));
      }
      if (input?.isActive !== undefined) {
        conditions.push(eq(costingInventoryItems.isActive, input.isActive));
      }

      const whereClause = and(...conditions);

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(costingInventoryItems)
        .where(whereClause);

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await ctx.db
        .select()
        .from(costingInventoryItems)
        .where(whereClause)
        .orderBy(asc(costingInventoryItems.name))
        .limit(limit)
        .offset(offset);

      // Fetch latest price for each item
      const itemsWithPrice = await Promise.all(
        items.map(async (item) => {
          const price = await getLatestPricePerUnit(ctx.db, ctx.tenantId, item.id);
          return { ...item, currentPricePerUnit: price };
        })
      );

      return { items: itemsWithPrice, total: totalResult?.count ?? 0 };
    }),

  get: costingProcedure
    .use(requirePermission("costing:view"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [item] = await ctx.db
        .select()
        .from(costingInventoryItems)
        .where(
          and(
            eq(costingInventoryItems.id, input.id),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      const price = await getLatestPricePerUnit(ctx.db, ctx.tenantId, item.id);
      return { ...item, currentPricePerUnit: price };
    }),

  create: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        name: z.string().min(1).max(300),
        brand: z.string().max(200).optional(),
        unitType: z.enum(unitTypes),
        unit: z.string().min(1).max(20),
        unitSizeGrams: z.string().regex(NUMERIC_REGEX).optional(),
        category: z.string().min(1).max(100),
        tags: z.array(z.string()).optional(),
        primarySupplier: z.string().max(200).optional(),
        secondarySupplier: z.string().max(200).optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
        // Optional initial price
        initialPrice: z
          .object({
            purchasePrice: z.string().regex(NUMERIC_REGEX),
            pricePerUnit: z.string().regex(NUMERIC_6_REGEX),
            supplier: z.string().max(200).optional(),
            effectiveDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD format"),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { initialPrice, ...itemData } = input;

      const [item] = await ctx.db
        .insert(costingInventoryItems)
        .values({
          tenantId: ctx.tenantId,
          name: itemData.name,
          brand: itemData.brand ?? null,
          unitType: itemData.unitType,
          unit: itemData.unit,
          unitSizeGrams: itemData.unitSizeGrams ?? null,
          category: itemData.category,
          tags: itemData.tags ?? null,
          primarySupplier: itemData.primarySupplier ?? null,
          secondarySupplier: itemData.secondarySupplier ?? null,
          notes: itemData.notes ?? null,
          isActive: itemData.isActive ?? true,
        })
        .returning();

      if (!item)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create inventory item",
        });

      // Add initial price if provided
      if (initialPrice) {
        await ctx.db.insert(costingPriceHistory).values({
          tenantId: ctx.tenantId,
          itemId: item.id,
          purchasePrice: initialPrice.purchasePrice,
          pricePerUnit: initialPrice.pricePerUnit,
          supplier: initialPrice.supplier ?? null,
          effectiveDate: initialPrice.effectiveDate,
        });
      }

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:inventory_item:created",
          resourceType: "costing_inventory_item",
          resourceId: item.id,
          changes: { after: { name: input.name } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return item;
    }),

  update: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(300).optional(),
        brand: z.string().max(200).nullable().optional(),
        unitType: z.enum(unitTypes).optional(),
        unit: z.string().min(1).max(20).optional(),
        unitSizeGrams: z.string().regex(NUMERIC_REGEX).nullable().optional(),
        category: z.string().min(1).max(100).optional(),
        tags: z.array(z.string()).nullable().optional(),
        primarySupplier: z.string().max(200).nullable().optional(),
        secondarySupplier: z.string().max(200).nullable().optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) updateData[key] = value;
      }

      const [updated] = await ctx.db
        .update(costingInventoryItems)
        .set(updateData)
        .where(
          and(
            eq(costingInventoryItems.id, id),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .returning();

      if (!updated)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:inventory_item:updated",
          resourceType: "costing_inventory_item",
          resourceId: id,
          changes: { after: updateData },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),

  delete: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .update(costingInventoryItems)
        .set({ deletedAt: new Date(), deletedBy: ctx.session!.user.id })
        .where(
          and(
            eq(costingInventoryItems.id, input.id),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .returning();

      if (!deleted)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:inventory_item:deleted",
          resourceType: "costing_inventory_item",
          resourceId: input.id,
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { success: true };
    }),

  updatePrice: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        itemId: z.string().uuid(),
        purchasePrice: z.string().regex(NUMERIC_REGEX),
        pricePerUnit: z.string().regex(NUMERIC_6_REGEX),
        supplier: z.string().max(200).optional(),
        effectiveDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD format"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify item belongs to tenant
      const [item] = await ctx.db
        .select({ id: costingInventoryItems.id })
        .from(costingInventoryItems)
        .where(
          and(
            eq(costingInventoryItems.id, input.itemId),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .limit(1);

      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      const [priceEntry] = await ctx.db
        .insert(costingPriceHistory)
        .values({
          tenantId: ctx.tenantId,
          itemId: input.itemId,
          purchasePrice: input.purchasePrice,
          pricePerUnit: input.pricePerUnit,
          supplier: input.supplier ?? null,
          effectiveDate: input.effectiveDate,
          notes: input.notes ?? null,
        })
        .returning();

      if (!priceEntry)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create price entry",
        });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:price:updated",
          resourceType: "costing_price_history",
          resourceId: priceEntry.id,
          changes: {
            after: {
              itemId: input.itemId,
              purchasePrice: input.purchasePrice,
              pricePerUnit: input.pricePerUnit,
            },
          },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return priceEntry;
    }),
});

// ============================================
// Price History Router
// ============================================
const priceHistoryRouter = router({
  getForItem: costingProcedure
    .use(requirePermission("costing:view"))
    .input(
      z.object({
        itemId: z.string().uuid(),
        fromDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD format").optional(),
        toDate: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD format").optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify item belongs to tenant
      const [item] = await ctx.db
        .select({ id: costingInventoryItems.id })
        .from(costingInventoryItems)
        .where(
          and(
            eq(costingInventoryItems.id, input.itemId),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .limit(1);

      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      const conditions: any[] = [
        eq(costingPriceHistory.itemId, input.itemId),
        eq(costingPriceHistory.tenantId, ctx.tenantId),
      ];

      if (input.fromDate) {
        conditions.push(gte(costingPriceHistory.effectiveDate, input.fromDate));
      }
      if (input.toDate) {
        conditions.push(lte(costingPriceHistory.effectiveDate, input.toDate));
      }

      return ctx.db
        .select()
        .from(costingPriceHistory)
        .where(and(...conditions))
        .orderBy(desc(costingPriceHistory.effectiveDate), desc(costingPriceHistory.createdAt));
    }),
});

// ============================================
// Recipes Router
// ============================================
const recipesRouter = router({
  list: costingProcedure
    .use(requirePermission("costing:view"))
    .input(
      z
        .object({
          type: z.enum(recipeTypes).optional(),
          search: z.string().optional(),
          currentOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional().default(50),
          offset: z.number().int().min(0).optional().default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const conditions: any[] = [
        eq(costingRecipes.tenantId, ctx.tenantId),
        isNull(costingRecipes.deletedAt),
      ];

      if (input?.type) {
        conditions.push(eq(costingRecipes.type, input.type));
      }
      if (input?.search) {
        conditions.push(
          ilike(costingRecipes.name, `%${input.search.replace(/[%_\\]/g, "\\$&")}%`)
        );
      }
      if (input?.currentOnly !== false) {
        conditions.push(eq(costingRecipes.isCurrent, true));
      }

      const whereClause = and(...conditions);

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(costingRecipes)
        .where(whereClause);

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await ctx.db
        .select()
        .from(costingRecipes)
        .where(whereClause)
        .orderBy(asc(costingRecipes.name), desc(costingRecipes.version))
        .limit(limit)
        .offset(offset);

      return { items, total: totalResult?.count ?? 0 };
    }),

  get: costingProcedure
    .use(requirePermission("costing:view"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [recipe] = await ctx.db
        .select()
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      // Fetch ingredients with their names
      const ingredients = await ctx.db
        .select()
        .from(costingRecipeIngredients)
        .where(eq(costingRecipeIngredients.recipeId, recipe.id))
        .orderBy(asc(costingRecipeIngredients.sortOrder));

      // Enrich ingredients with names
      const enriched = await Promise.all(
        ingredients.map(async (ing) => {
          let name = "Unknown";
          if (ing.ingredientType === "raw" && ing.inventoryItemId) {
            const [item] = await ctx.db
              .select({ name: costingInventoryItems.name })
              .from(costingInventoryItems)
              .where(
                and(
                  eq(costingInventoryItems.id, ing.inventoryItemId),
                  eq(costingInventoryItems.tenantId, ctx.tenantId)
                )
              )
              .limit(1);
            name = item?.name ?? "Unknown Item";
          } else if (ing.ingredientType === "base" && ing.baseRecipeId) {
            const [base] = await ctx.db
              .select({ name: costingRecipes.name })
              .from(costingRecipes)
              .where(
                and(
                  eq(costingRecipes.id, ing.baseRecipeId),
                  eq(costingRecipes.tenantId, ctx.tenantId)
                )
              )
              .limit(1);
            name = base?.name ?? "Unknown Recipe";
          }
          return { ...ing, name };
        })
      );

      return { ...recipe, ingredients: enriched };
    }),

  create: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        name: z.string().min(1).max(300),
        type: z.enum(recipeTypes),
        yieldLossPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        sellingPrice: z.string().regex(PRICE_REGEX).optional(),
        vatPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        discountPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [recipe] = await ctx.db
        .insert(costingRecipes)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          type: input.type,
          yieldLossPct: input.yieldLossPct ?? "0",
          sellingPrice: input.sellingPrice ?? null,
          vatPct: input.vatPct ?? "12",
          discountPct: input.discountPct ?? "0",
          notes: input.notes ?? null,
        })
        .returning();

      if (!recipe)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create recipe" });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:recipe:created",
          resourceType: "costing_recipe",
          resourceId: recipe.id,
          changes: { after: { name: input.name, type: input.type } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return recipe;
    }),

  update: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(300).optional(),
        yieldLossPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        sellingPrice: z.string().regex(PRICE_REGEX).nullable().optional(),
        vatPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        discountPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) updateData[key] = value;
      }

      const [updated] = await ctx.db
        .update(costingRecipes)
        .set(updateData)
        .where(
          and(
            eq(costingRecipes.id, id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:recipe:updated",
          resourceType: "costing_recipe",
          resourceId: id,
          changes: { after: updateData },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),

  delete: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await ctx.db
        .update(costingRecipes)
        .set({ deletedAt: new Date(), deletedBy: ctx.session!.user.id })
        .where(
          and(
            eq(costingRecipes.id, input.id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:recipe:deleted",
          resourceType: "costing_recipe",
          resourceId: input.id,
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { success: true };
    }),

  duplicate: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1).max(300),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch original recipe
      const [original] = await ctx.db
        .select()
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      // Create new recipe
      const [newRecipe] = await ctx.db
        .insert(costingRecipes)
        .values({
          tenantId: ctx.tenantId,
          name: input.newName,
          type: original.type,
          yieldLossPct: original.yieldLossPct,
          sellingPrice: original.sellingPrice,
          vatPct: original.vatPct,
          discountPct: original.discountPct,
          notes: original.notes,
        })
        .returning();

      if (!newRecipe)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to duplicate recipe",
        });

      // Copy ingredients
      const ingredients = await ctx.db
        .select()
        .from(costingRecipeIngredients)
        .where(eq(costingRecipeIngredients.recipeId, input.id));

      if (ingredients.length > 0) {
        await ctx.db.insert(costingRecipeIngredients).values(
          ingredients.map((ing: any) => ({
            recipeId: newRecipe.id,
            ingredientType: ing.ingredientType,
            inventoryItemId: ing.inventoryItemId,
            baseRecipeId: ing.baseRecipeId,
            amount: ing.amount,
            unitCost: ing.unitCost,
            extendedCost: ing.extendedCost,
            sortOrder: ing.sortOrder,
          }))
        );
      }

      // Recalculate
      const calculated = await recalculateRecipeCosts(ctx.db, ctx.tenantId, newRecipe.id);

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:recipe:duplicated",
          resourceType: "costing_recipe",
          resourceId: newRecipe.id,
          changes: { after: { name: input.newName, sourceId: input.id } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return calculated;
    }),

  scale: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        factor: z.number().positive().max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      // Fix 6: Auto-snapshot before destructive scale operation
      await autoSnapshot(ctx.db, ctx.tenantId, input.id, `Auto-snapshot before scale x${input.factor}`);

      // Scale all ingredient amounts using Decimal
      const ingredients = await ctx.db
        .select()
        .from(costingRecipeIngredients)
        .where(eq(costingRecipeIngredients.recipeId, input.id));

      const factor = new Decimal(input.factor);
      for (const ing of ingredients) {
        const newAmount = new Decimal(ing.amount).mul(factor).toFixed(4);
        const newExtended = new Decimal(ing.extendedCost).mul(factor).toFixed(4);
        await ctx.db
          .update(costingRecipeIngredients)
          .set({ amount: newAmount, extendedCost: newExtended })
          .where(eq(costingRecipeIngredients.id, ing.id));
      }

      // Recalculate
      return recalculateRecipeCosts(ctx.db, ctx.tenantId, input.id);
    }),

  createVersion: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch current recipe
      const [current] = await ctx.db
        .select()
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.id),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      // Mark current as not current
      await ctx.db
        .update(costingRecipes)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(eq(costingRecipes.id, input.id));

      // Determine parent: use existing parent or this recipe as the parent
      const parentId = current.parentRecipeId ?? current.id;

      // Create new version
      const [newVersion] = await ctx.db
        .insert(costingRecipes)
        .values({
          tenantId: ctx.tenantId,
          name: current.name,
          type: current.type,
          version: current.version + 1,
          parentRecipeId: parentId,
          yieldLossPct: current.yieldLossPct,
          sellingPrice: current.sellingPrice,
          vatPct: current.vatPct,
          discountPct: current.discountPct,
          notes: current.notes,
          isCurrent: true,
        })
        .returning();

      if (!newVersion)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create version",
        });

      // Copy ingredients
      const ingredients = await ctx.db
        .select()
        .from(costingRecipeIngredients)
        .where(eq(costingRecipeIngredients.recipeId, input.id));

      if (ingredients.length > 0) {
        await ctx.db.insert(costingRecipeIngredients).values(
          ingredients.map((ing: any) => ({
            recipeId: newVersion.id,
            ingredientType: ing.ingredientType,
            inventoryItemId: ing.inventoryItemId,
            baseRecipeId: ing.baseRecipeId,
            amount: ing.amount,
            unitCost: ing.unitCost,
            extendedCost: ing.extendedCost,
            sortOrder: ing.sortOrder,
          }))
        );
      }

      // Recalculate
      const calculated = await recalculateRecipeCosts(ctx.db, ctx.tenantId, newVersion.id);

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:recipe:versioned",
          resourceType: "costing_recipe",
          resourceId: newVersion.id,
          changes: {
            after: { version: newVersion.version, sourceId: input.id },
          },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return calculated;
    }),
});

// ============================================
// Recipe Ingredients Router
// ============================================
const ingredientsRouter = router({
  add: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        recipeId: z.string().uuid(),
        ingredientType: z.enum(ingredientTypes),
        inventoryItemId: z.string().uuid().optional(),
        baseRecipeId: z.string().uuid().optional(),
        amount: z.string().regex(NUMERIC_REGEX),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      // Validate ingredient reference
      let unitCost = "0";

      if (input.ingredientType === "raw") {
        if (!input.inventoryItemId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "inventoryItemId required for raw ingredients",
          });

        // Verify item belongs to tenant
        const [item] = await ctx.db
          .select({ id: costingInventoryItems.id })
          .from(costingInventoryItems)
          .where(
            and(
              eq(costingInventoryItems.id, input.inventoryItemId),
              eq(costingInventoryItems.tenantId, ctx.tenantId),
              isNull(costingInventoryItems.deletedAt)
            )
          )
          .limit(1);

        if (!item)
          throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

        const price = await getLatestPricePerUnit(ctx.db, ctx.tenantId, input.inventoryItemId);
        unitCost = price ?? "0";
      } else if (input.ingredientType === "base") {
        if (!input.baseRecipeId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "baseRecipeId required for base ingredients",
          });

        // Verify base recipe belongs to tenant
        const [base] = await ctx.db
          .select({ id: costingRecipes.id, costPerGram: costingRecipes.costPerGram })
          .from(costingRecipes)
          .where(
            and(
              eq(costingRecipes.id, input.baseRecipeId),
              eq(costingRecipes.tenantId, ctx.tenantId),
              isNull(costingRecipes.deletedAt)
            )
          )
          .limit(1);

        if (!base)
          throw new TRPCError({ code: "NOT_FOUND", message: "Base recipe not found" });

        unitCost = base.costPerGram ?? "0";
      }

      const extendedCost = new Decimal(input.amount).mul(unitCost).toFixed(4);

      const [ingredient] = await ctx.db
        .insert(costingRecipeIngredients)
        .values({
          recipeId: input.recipeId,
          ingredientType: input.ingredientType,
          inventoryItemId: input.ingredientType === "raw" ? input.inventoryItemId! : null,
          baseRecipeId: input.ingredientType === "base" ? input.baseRecipeId! : null,
          amount: input.amount,
          unitCost,
          extendedCost,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();

      if (!ingredient)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add ingredient",
        });

      // Recalculate recipe
      await recalculateRecipeCosts(ctx.db, ctx.tenantId, input.recipeId);

      return ingredient;
    }),

  update: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        recipeId: z.string().uuid(),
        amount: z.string().regex(NUMERIC_REGEX).optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const updateData: Record<string, unknown> = {};
      if (input.amount !== undefined) updateData.amount = input.amount;
      if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

      if (input.amount !== undefined) {
        // Fetch current ingredient to get unitCost
        const [current] = await ctx.db
          .select({ unitCost: costingRecipeIngredients.unitCost })
          .from(costingRecipeIngredients)
          .where(
            and(
              eq(costingRecipeIngredients.id, input.id),
              eq(costingRecipeIngredients.recipeId, input.recipeId)
            )
          )
          .limit(1);

        if (!current)
          throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });

        updateData.extendedCost = new Decimal(input.amount).mul(current.unitCost).toFixed(4);
      }

      const [updated] = await ctx.db
        .update(costingRecipeIngredients)
        .set(updateData)
        .where(
          and(
            eq(costingRecipeIngredients.id, input.id),
            eq(costingRecipeIngredients.recipeId, input.recipeId)
          )
        )
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });

      // Recalculate recipe
      await recalculateRecipeCosts(ctx.db, ctx.tenantId, input.recipeId);

      return updated;
    }),

  remove: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        id: z.string().uuid(),
        recipeId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const [deleted] = await ctx.db
        .delete(costingRecipeIngredients)
        .where(
          and(
            eq(costingRecipeIngredients.id, input.id),
            eq(costingRecipeIngredients.recipeId, input.recipeId)
          )
        )
        .returning();

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found" });

      // Recalculate recipe
      await recalculateRecipeCosts(ctx.db, ctx.tenantId, input.recipeId);

      return { success: true };
    }),

  reorder: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(
      z.object({
        recipeId: z.string().uuid(),
        items: z
          .array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() }))
          .max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      for (const item of input.items) {
        await ctx.db
          .update(costingRecipeIngredients)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(costingRecipeIngredients.id, item.id),
              eq(costingRecipeIngredients.recipeId, input.recipeId)
            )
          );
      }

      return { success: true };
    }),
});

// ============================================
// Costing Calculations Router
// ============================================
const costingCalcRouter = router({
  recalculateRecipe: costingProcedure
    .use(requirePermission("costing:manage"))
    .input(z.object({ recipeId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      return recalculateRecipeCosts(ctx.db, ctx.tenantId, input.recipeId);
    }),

  recalculateCascade: costingProcedure
    .use(requirePermission("costing:admin"))
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Verify item belongs to tenant
      const [item] = await ctx.db
        .select({ id: costingInventoryItems.id })
        .from(costingInventoryItems)
        .where(
          and(
            eq(costingInventoryItems.id, input.itemId),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .limit(1);

      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      // Fix 1: Tenant-scoped join for direct ingredients
      const directIngredients = await ctx.db
        .select({ recipeId: costingRecipeIngredients.recipeId })
        .from(costingRecipeIngredients)
        .innerJoin(costingRecipes, eq(costingRecipeIngredients.recipeId, costingRecipes.id))
        .where(and(
          eq(costingRecipeIngredients.inventoryItemId, input.itemId),
          eq(costingRecipes.tenantId, ctx.tenantId),
          isNull(costingRecipes.deletedAt)
        ));

      const directRecipeIds = [
        ...new Set(directIngredients.map((i) => i.recipeId)),
      ];

      // Recalculate direct recipes
      const updatedRecipes: any[] = [];
      for (const recipeId of directRecipeIds) {
        const updated = await recalculateRecipeCosts(ctx.db, ctx.tenantId, recipeId);
        updatedRecipes.push(updated);
      }

      // Find final products using updated base recipes as ingredients
      const baseRecipeIds = updatedRecipes
        .filter((r) => r.type === "base")
        .map((r) => r.id);

      if (baseRecipeIds.length > 0) {
        // Fix 1: Tenant-scoped join for cascade ingredients
        const cascadeIngredients = await ctx.db
          .select({ recipeId: costingRecipeIngredients.recipeId })
          .from(costingRecipeIngredients)
          .innerJoin(costingRecipes, eq(costingRecipeIngredients.recipeId, costingRecipes.id))
          .where(and(
            inArray(costingRecipeIngredients.baseRecipeId, baseRecipeIds),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          ));

        const cascadeRecipeIds = [
          ...new Set(cascadeIngredients.map((i) => i.recipeId)),
        ];

        for (const recipeId of cascadeRecipeIds) {
          const updated = await recalculateRecipeCosts(ctx.db, ctx.tenantId, recipeId);
          updatedRecipes.push(updated);
        }
      }

      return { updatedCount: updatedRecipes.length, recipes: updatedRecipes };
    }),

  priceImpactAnalysis: costingProcedure
    .use(requirePermission("costing:view"))
    .input(
      z.object({
        itemId: z.string().uuid(),
        newPricePerUnit: z.string().regex(NUMERIC_6_REGEX),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify item belongs to tenant
      const [item] = await ctx.db
        .select()
        .from(costingInventoryItems)
        .where(
          and(
            eq(costingInventoryItems.id, input.itemId),
            eq(costingInventoryItems.tenantId, ctx.tenantId),
            isNull(costingInventoryItems.deletedAt)
          )
        )
        .limit(1);

      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });

      const currentPrice = await getLatestPricePerUnit(ctx.db, ctx.tenantId, input.itemId);
      const oldPricePerUnit = new Decimal(currentPrice ?? "0");
      const newPricePerUnit = new Decimal(input.newPricePerUnit);

      // Fix 1: Tenant-scoped join for price impact ingredients
      const directIngredients = await ctx.db
        .select({
          recipeId: costingRecipeIngredients.recipeId,
          amount: costingRecipeIngredients.amount,
        })
        .from(costingRecipeIngredients)
        .innerJoin(costingRecipes, eq(costingRecipeIngredients.recipeId, costingRecipes.id))
        .where(and(
          eq(costingRecipeIngredients.inventoryItemId, input.itemId),
          eq(costingRecipes.tenantId, ctx.tenantId),
          isNull(costingRecipes.deletedAt)
        ));

      const impacts: any[] = [];

      for (const ing of directIngredients) {
        const [recipe] = await ctx.db
          .select()
          .from(costingRecipes)
          .where(
            and(
              eq(costingRecipes.id, ing.recipeId),
              eq(costingRecipes.tenantId, ctx.tenantId),
              isNull(costingRecipes.deletedAt)
            )
          )
          .limit(1);

        if (!recipe) continue;

        const amount = new Decimal(ing.amount);
        const oldIngCost = amount.mul(oldPricePerUnit);
        const newIngCost = amount.mul(newPricePerUnit);
        const costDiff = newIngCost.minus(oldIngCost);

        const oldTotal = new Decimal(recipe.totalCost ?? "0");
        const newTotal = oldTotal.plus(costDiff);

        let oldCogsPct: string | null = null;
        let newCogsPct: string | null = null;
        if (recipe.type === "final" && recipe.sellingPrice) {
          const sp = new Decimal(recipe.sellingPrice);
          if (sp.gt(0)) {
            oldCogsPct = oldTotal.div(sp).mul(100).toFixed(2);
            newCogsPct = newTotal.div(sp).mul(100).toFixed(2);
          }
        }

        impacts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          recipeType: recipe.type,
          oldTotalCost: oldTotal.toFixed(4),
          newTotalCost: newTotal.toFixed(4),
          costDifference: costDiff.toFixed(4),
          oldCogsPct,
          newCogsPct,
        });
      }

      return {
        itemName: item.name,
        oldPricePerUnit: oldPricePerUnit.toFixed(6),
        newPricePerUnit: newPricePerUnit.toFixed(6),
        priceDifference: newPricePerUnit.minus(oldPricePerUnit).toFixed(6),
        affectedRecipes: impacts,
      };
    }),

  createSnapshot: costingProcedure
    .use(requirePermission("costing:admin"))
    .input(
      z.object({
        recipeId: z.string().uuid(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch recipe with ingredients
      const [recipe] = await ctx.db
        .select()
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const ingredients = await ctx.db
        .select()
        .from(costingRecipeIngredients)
        .where(eq(costingRecipeIngredients.recipeId, input.recipeId))
        .orderBy(asc(costingRecipeIngredients.sortOrder));

      const [snapshot] = await ctx.db
        .insert(costingSnapshots)
        .values({
          tenantId: ctx.tenantId,
          recipeId: input.recipeId,
          totalCost: recipe.totalCost ?? "0",
          costPerGram: recipe.costPerGram,
          cogsPct: recipe.cogsPct,
          ingredientCosts: ingredients.map((ing: any) => ({
            id: ing.id,
            ingredientType: ing.ingredientType,
            inventoryItemId: ing.inventoryItemId,
            baseRecipeId: ing.baseRecipeId,
            amount: ing.amount,
            unitCost: ing.unitCost,
            extendedCost: ing.extendedCost,
          })),
          notes: input.notes ?? null,
        })
        .returning();

      if (!snapshot)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create snapshot",
        });

      await createAuditLog(
        {
          tenantId: ctx.tenantId,
          userId: ctx.session!.user.id,
          action: "costing:snapshot:created",
          resourceType: "costing_snapshot",
          resourceId: snapshot.id,
          changes: { after: { recipeId: input.recipeId } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return snapshot;
    }),

  // Fix 5: Snapshot read endpoints
  listSnapshots: costingProcedure
    .use(requirePermission("costing:view"))
    .input(
      z.object({
        recipeId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify recipe belongs to tenant
      const [recipe] = await ctx.db
        .select({ id: costingRecipes.id })
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.id, input.recipeId),
            eq(costingRecipes.tenantId, ctx.tenantId),
            isNull(costingRecipes.deletedAt)
          )
        )
        .limit(1);

      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Recipe not found" });

      const whereClause = and(
        eq(costingSnapshots.recipeId, input.recipeId),
        eq(costingSnapshots.tenantId, ctx.tenantId)
      );

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(costingSnapshots)
        .where(whereClause);

      const items = await ctx.db
        .select()
        .from(costingSnapshots)
        .where(whereClause)
        .orderBy(desc(costingSnapshots.snapshotDate))
        .limit(input.limit)
        .offset(input.offset);

      return { items, total: totalResult?.count ?? 0 };
    }),

  getSnapshot: costingProcedure
    .use(requirePermission("costing:view"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [snapshot] = await ctx.db
        .select()
        .from(costingSnapshots)
        .where(
          and(
            eq(costingSnapshots.id, input.id),
            eq(costingSnapshots.tenantId, ctx.tenantId)
          )
        )
        .limit(1);

      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });

      return snapshot;
    }),
});

// ============================================
// Dashboard Router
// ============================================
const dashboardRouter = router({
  getCostingSummary: costingProcedure
    .use(requirePermission("costing:view"))
    .query(async ({ ctx }) => {
      // Get all current final products
      const finalProducts = await ctx.db
        .select()
        .from(costingRecipes)
        .where(
          and(
            eq(costingRecipes.tenantId, ctx.tenantId),
            eq(costingRecipes.type, "final"),
            eq(costingRecipes.isCurrent, true),
            isNull(costingRecipes.deletedAt)
          )
        )
        .orderBy(asc(costingRecipes.name));

      return finalProducts.map((r) => ({
        id: r.id,
        name: r.name,
        totalCost: r.totalCost,
        sellingPrice: r.sellingPrice,
        cogsPct: r.cogsPct,
        costPerGram: r.costPerGram,
        netWeight: r.netWeight,
      }));
    }),
});

// ============================================
// Combined Costing Router
// ============================================
export const costingRouter = router({
  inventory: inventoryRouter,
  priceHistory: priceHistoryRouter,
  recipes: recipesRouter,
  ingredients: ingredientsRouter,
  costing: costingCalcRouter,
  dashboard: dashboardRouter,
});
