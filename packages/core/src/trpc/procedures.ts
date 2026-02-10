import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { checkPermission } from "../rbac/index";
import { isModuleEnabled } from "../modules/index";
import { withTenant } from "../tenant/index";

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
// Middleware: CSRF protection
// Verify X-TRPC-Source header on mutations
// ------------------------------------------
const csrfProtection = t.middleware(({ ctx, type, next }) => {
  // Only enforce on mutations (POST requests)
  if (type === "mutation") {
    const source = ctx.trpcSource;
    if (source !== "react" && source !== "server") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Invalid request source",
      });
    }
  }
  return next({ ctx });
});

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
// Middleware: Tenant context + RLS via withTenant()
// ------------------------------------------
const hasTenantContext = t.middleware(async ({ ctx, next }) => {
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

  // Set RLS context via withTenant for database-level isolation
  // Note: The actual withTenant wrapping happens per-query in routes that use ctx.tenantId.
  // Here we validate and pass the tenant context through.
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
// Middleware: Super Admin check (platform owner)
// ------------------------------------------
const isSuperAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (!ctx.session.user.isSuperAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Platform admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

// ------------------------------------------
// Procedures
// ------------------------------------------

/** No auth required */
export const publicProcedure = t.procedure;

/** Must be logged in (with CSRF protection on mutations) */
export const protectedProcedure = t.procedure
  .use(csrfProtection)
  .use(isAuthenticated);

/** Must be logged in + have a tenant selected */
export const tenantProcedure = t.procedure
  .use(csrfProtection)
  .use(hasTenantContext);

/** Must be owner or admin */
export const adminProcedure = t.procedure
  .use(csrfProtection)
  .use(isAdmin);

/** Must be a platform super admin */
export const superAdminProcedure = t.procedure
  .use(csrfProtection)
  .use(isAuthenticated)
  .use(isSuperAdmin);

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

// ------------------------------------------
// Module enforcement middleware factory
// ------------------------------------------

/**
 * Create a middleware that checks if a module is enabled for the current tenant.
 * Usage: tenantProcedure.use(requireModule("notes"))
 * Returns 403 if the module is disabled — enforced at DB level, not UI.
 */
export function requireModule(moduleId: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.session.tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No tenant context",
      });
    }

    const enabled = await isModuleEnabled(ctx.session.session.tenantId, moduleId);
    if (!enabled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Module "${moduleId}" is not enabled for this tenant`,
      });
    }

    return next({ ctx });
  });
}
