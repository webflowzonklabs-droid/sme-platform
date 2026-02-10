import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { checkPermission } from "../rbac/index";

// ============================================
// tRPC Initialization + Base Procedures
// ============================================

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

// ------------------------------------------
// Middleware: Auth (session validation)
// ------------------------------------------
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // now guaranteed non-null
    },
  });
});

// ------------------------------------------
// Middleware: Tenant context
// ------------------------------------------
const hasTenantContext = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }

  if (!ctx.session.session.tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No tenant selected. Please select a tenant first.",
    });
  }

  if (!ctx.session.membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this tenant",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId: ctx.session.session.tenantId,
      membership: ctx.session.membership,
    },
  });
});

// ------------------------------------------
// Middleware: Admin check (owner or admin role)
// ------------------------------------------
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (!ctx.session.membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tenant context",
    });
  }

  const roleSlug = ctx.session.membership.roleSlug;
  if (roleSlug !== "owner" && roleSlug !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId: ctx.session.session.tenantId!,
      membership: ctx.session.membership,
    },
  });
});

// ------------------------------------------
// Procedures
// ------------------------------------------

/** No auth required */
export const publicProcedure = t.procedure;

/** Must be logged in */
export const protectedProcedure = t.procedure.use(isAuthenticated);

/** Must be logged in + have a tenant selected */
export const tenantProcedure = t.procedure.use(hasTenantContext);

/** Must be owner or admin */
export const adminProcedure = t.procedure.use(isAdmin);

// ------------------------------------------
// Permission middleware factory
// ------------------------------------------

/**
 * Create a middleware that checks for a specific permission.
 * Usage: tenantProcedure.use(requirePermission("inventory:items:read"))
 */
export function requirePermission(permission: string) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session?.membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No permissions available",
      });
    }

    const { permissions } = ctx.session.membership;

    if (!checkPermission(permissions, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${permission}`,
      });
    }

    return next({ ctx });
  });
}
