import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import { checkPermission } from "../rbac/index";
import { isModuleEnabled } from "../modules/index";
import { withTenant } from "../tenant/index";
import { db } from "../db/index";
import { sql } from "drizzle-orm";

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
//
// CRITICAL FIX (2026-02-11): This middleware now ACTUALLY calls
// withTenant() to set SET LOCAL app.current_tenant_id within a
// transaction. All downstream middleware and route handlers execute
// inside this transaction, with ctx.db pointing to the transaction.
//
// This means:
// - All queries via ctx.db are RLS-enforced
// - The db connection is sme_app (non-superuser), which respects RLS
// - Routes MUST use ctx.db, not import db directly
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

  // Wrap ALL downstream execution in a tenant-scoped transaction.
  // This sets SET LOCAL app.current_tenant_id so RLS policies
  // on the sme_app connection actually filter by tenant.
  return withTenant(tenantId, async (tx) => {
    return next({
      ctx: {
        ...ctx,
        db: tx, // RLS-enforced transaction (sme_app role)
        session: ctx.session!,
        tenantId,
        membership: ctx.session!.membership!,
      },
    });
  });
});

// ------------------------------------------
// Middleware: Admin check (owner or admin role)
// Uses tenant-scoped context (inherits from hasTenantContext)
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
//
// ARCHITECTURE DECISION (2026-02-11):
// Super-admin procedures use adminDb (superuser) which BYPASSES RLS.
// This is intentional — super-admin operations need cross-tenant
// visibility (listing all tenants, managing modules, etc.).
// The ctx.db remains as adminDb (set in createContext).
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

  // ctx.db is already adminDb from createContext — no override needed
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

/** No auth required. ctx.db = adminDb (for auth flows that need cross-tenant access) */
export const publicProcedure = t.procedure;

/** Must be logged in (with CSRF protection on mutations). ctx.db = adminDb */
export const protectedProcedure = t.procedure
  .use(csrfProtection)
  .use(isAuthenticated);

/** Must be logged in + have a tenant selected. ctx.db = RLS-enforced transaction */
export const tenantProcedure = t.procedure
  .use(csrfProtection)
  .use(hasTenantContext);

/** Must be owner or admin within a tenant. ctx.db = RLS-enforced transaction */
export const adminProcedure = t.procedure
  .use(csrfProtection)
  .use(hasTenantContext)
  .use(isAdmin);

/** Must be a platform super admin. ctx.db = adminDb (bypasses RLS for cross-tenant ops) */
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
 *
 * Uses ctx.db (the RLS-enforced transaction) to query tenant_modules,
 * ensuring the query runs within the tenant context.
 */
export function requireModule(moduleId: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.session.tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No tenant context",
      });
    }

    // Use ctx.db (tenant-scoped transaction) for the module check
    // This runs within the RLS transaction set by hasTenantContext
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
