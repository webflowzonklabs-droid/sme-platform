import { TRPCError } from "@trpc/server";
import { eq, and, isNull, gt, desc, ilike } from "drizzle-orm";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc/procedures";
import { requirePermission } from "../../trpc/procedures";
import { db } from "../../db/index";
import { notes } from "./schema";
import { createAuditLog } from "../../audit/index";
import { paginationSchema, paginatedResult } from "@sme/shared";

// ============================================
// Notes Router — example module CRUD
// ============================================

export const notesRouter = router({
  /**
   * List notes for the current tenant.
   */
  list: tenantProcedure
    .use(requirePermission("notes:notes:read"))
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const items = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.tenantId, ctx.tenantId),
            isNull(notes.deletedAt),
            input.search
              ? ilike(notes.title, `%${input.search}%`)
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
  get: tenantProcedure
    .use(requirePermission("notes:notes:read"))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [note] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, ctx.tenantId),
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
  create: tenantProcedure
    .use(requirePermission("notes:notes:write"))
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [note] = await db
        .insert(notes)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
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

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "notes:note:created",
        resourceType: "note",
        resourceId: note.id,
        changes: { after: { title: input.title } },
      });

      return note;
    }),

  /**
   * Update a note.
   */
  update: tenantProcedure
    .use(requirePermission("notes:notes:write"))
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;

      const [updated] = await db
        .update(notes)
        .set(updateData)
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, ctx.tenantId),
            isNull(notes.deletedAt)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "notes:note:updated",
        resourceType: "note",
        resourceId: input.id,
        changes: { after: updateData },
      });

      return updated;
    }),

  /**
   * Soft-delete a note.
   */
  delete: tenantProcedure
    .use(requirePermission("notes:notes:delete"))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [deleted] = await db
        .update(notes)
        .set({
          deletedAt: new Date(),
          deletedBy: ctx.session.user.id,
        })
        .where(
          and(
            eq(notes.id, input.id),
            eq(notes.tenantId, ctx.tenantId),
            isNull(notes.deletedAt)
          )
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      await createAuditLog({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        action: "notes:note:deleted",
        resourceType: "note",
        resourceId: input.id,
      });

      return { success: true };
    }),
});
