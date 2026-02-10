import { TRPCError } from "@trpc/server";
import { eq, and, isNull, gt, desc, ilike } from "drizzle-orm";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/procedures";
import { requirePermission, requireModule } from "../../trpc/procedures";
import { notes } from "./schema";
import { createAuditLog } from "../../audit/index";
import { paginationSchema, paginatedResult } from "@sme/shared";

// ============================================
// Helper: Escape LIKE special characters
// ============================================
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

// ============================================
// Notes Router — example module CRUD
// Module enforcement: all routes require "notes" module to be enabled
//
// All queries use ctx.db which is the RLS-enforced transaction
// set by hasTenantContext middleware. No need to import db directly.
// ============================================

// Base procedure for notes — requires module to be enabled
const notesProcedure = tenantProcedure.use(requireModule("notes"));

export const notesRouter = router({
  /**
   * List notes for the current tenant.
   */
  list: notesProcedure
    .use(requirePermission("notes:notes:read"))
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const items = await ctx.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.tenantId, tenantId),
            isNull(notes.deletedAt),
            input.search
              ? ilike(notes.title, `%${escapeLike(input.search)}%`)
              : undefined,
            input.cursor ? gt(notes.id, input.cursor) : undefined
          )
        )
        .orderBy(desc(notes.updatedAt))
        .limit(input.limit + 1);

      return paginatedResult(items, input.limit);
    }),

  /**
   * Get a single note.
   */
  get: notesProcedure
    .use(requirePermission("notes:notes:read"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const [note] = await ctx.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, tenantId),
            isNull(notes.deletedAt)
          )
        )
        .limit(1);

      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      return note;
    }),

  /**
   * Create a new note.
   */
  create: notesProcedure
    .use(requirePermission("notes:notes:write"))
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const userId = ctx.session!.user.id;
      const [note] = await ctx.db
        .insert(notes)
        .values({
          tenantId,
          userId,
          title: input.title,
          content: input.content ?? "",
        })
        .returning();

      if (!note) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create note",
        });
      }

      await createAuditLog(
        {
          tenantId,
          userId,
          action: "notes:note:created",
          resourceType: "note",
          resourceId: note.id,
          changes: { after: { title: input.title } },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return note;
    }),

  /**
   * Update a note.
   */
  update: notesProcedure
    .use(requirePermission("notes:notes:write"))
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const userId = ctx.session!.user.id;

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;

      const [updated] = await ctx.db
        .update(notes)
        .set(updateData)
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, tenantId),
            isNull(notes.deletedAt)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await createAuditLog(
        {
          tenantId,
          userId,
          action: "notes:note:updated",
          resourceType: "note",
          resourceId: input.id,
          changes: { after: updateData },
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return updated;
    }),

  /**
   * Soft-delete a note.
   */
  delete: notesProcedure
    .use(requirePermission("notes:notes:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const userId = ctx.session!.user.id;

      const [deleted] = await ctx.db
        .update(notes)
        .set({
          deletedAt: new Date(),
          deletedBy: userId,
        })
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, tenantId),
            isNull(notes.deletedAt)
          )
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await createAuditLog(
        {
          tenantId,
          userId,
          action: "notes:note:deleted",
          resourceType: "note",
          resourceId: input.id,
          ipAddress: ctx.ipAddress,
        },
        ctx.db
      );

      return { success: true };
    }),
});
