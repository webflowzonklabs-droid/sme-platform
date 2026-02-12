import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { checkPermission } from "../rbac/index";
import { isModuleEnabled } from "../modules/index";
import { db } from "../db/index";

// ============================================
// tRPC Initialization + Base Procedures
// ============================================
// Tenant isolation is enforced at the application layer.
// All tenant-scoped queries use WHERE tenant_id = ? filters.
// ctx.db is the single database connection everywhere.
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
// ------------------------------------------
const csrfProtection = t.middleware(({ ctx, type, next }) => {
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
      session: ctx.session,
    },
  });
});

// ------------------------------------------
// Middleware: Tenant context
// Validates tenant selection and membership.
// Passes tenantId in context for WHERE filters.
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

  const tenantId = ctx.session.session.tenantId;

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId,
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

/** Must be logged in + have a tenant selected. tenantId in ctx */
export const tenantProcedure = t.procedure
  .use(csrfProtection)
  .use(hasTenantContext);

/** Must be owner or admin within a tenant */
export const adminProcedure = t.procedure
  .use(csrfProtection)
  .use(hasTenantContext)
  .use(isAdmin);

/** Must be a platform super admin */
export const superAdminProcedure = t.procedure
  .use(csrfProtection)
  .use(isAuthenticated)
  .use(isSuperAdmin);

// ------------------------------------------
// Permission middleware factory
// ------------------------------------------

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

export function requireModule(moduleId: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.session.tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No tenant context",
      });
    }

    const ctxDb = (ctx as Record<string, unknown>).db;
    const enabled = await isModuleEnabled(
      ctx.session.session.tenantId,
      moduleId,
      ctxDb as typeof db
    );
    if (!enabled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Module "${moduleId}" is not enabled for this tenant`,
      });
    }

    return next({ ctx });
  });
}
