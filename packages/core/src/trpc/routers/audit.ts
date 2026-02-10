import { eq, and, desc, gt } from "drizzle-orm";
import { z } from "zod";
import { router, tenantProcedure } from "../procedures";
import { requirePermission } from "../procedures";
import { auditLogs, users } from "../../db/schema/index";
import { paginationSchema } from "@sme/shared";
import { paginatedResult } from "@sme/shared";

// ============================================
// Audit Router — view audit logs
// All queries use ctx.db (RLS-enforced transaction)
// ============================================

export const auditRouter = router({
  /**
   * List audit log entries for the current tenant.
   */
  list: tenantProcedure
    .use(requirePermission("core:audit:read"))
    .input(
      paginationSchema.extend({
        resourceType: z.string().optional(),
        action: z.string().optional(),
        userId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const items = await ctx.db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          resourceType: auditLogs.resourceType,
          resourceId: auditLogs.resourceId,
          changes: auditLogs.changes,
          ipAddress: auditLogs.ipAddress,
          createdAt: auditLogs.createdAt,
          userId: auditLogs.userId,
          userName: users.fullName,
          userEmail: users.email,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(
          and(
            eq(auditLogs.tenantId, ctx.tenantId),
            input.resourceType
              ? eq(auditLogs.resourceType, input.resourceType)
              : undefined,
            input.action
              ? eq(auditLogs.action, input.action)
              : undefined,
            input.userId
              ? eq(auditLogs.userId, input.userId)
              : undefined,
            input.cursor ? gt(auditLogs.id, input.cursor) : undefined
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit + 1);

      return paginatedResult(items, input.limit);
    }),
});
