// ============================================
// Core package — main entry point
// ============================================

// Database
export { db, adminDb, schema } from "./db/index";
export type { Database } from "./db/index";

// Auth
export {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  invalidateSession,
  invalidateAllUserSessions,
  cleanupExpiredSessions,
  loginWithPassword,
  registerUser,
  registerUserWithTenant,
  AuthError,
} from "./auth/index";
export type {
  SessionValidationResult,
  LoginResult,
  RegisterResult,
  RegisterWithTenantResult,
} from "./auth/index";

// RBAC
export {
  checkPermission,
  checkAllPermissions,
  checkAnyPermission,
  hasPermission,
} from "./rbac/index";

// Tenant
export { getTenantSlugById } from "./tenant/index";

// Modules
export {
  defineModule,
  getModuleRegistry,
  getModule,
  enableModule,
  disableModule,
  isModuleEnabled,
  getEnabledModules,
} from "./modules/index";
export type { ModuleConfig } from "./modules/index";

// Audit
export { createAuditLog, createAuditLogBatch } from "./audit/index";
export type { AuditLogEntry } from "./audit/index";

// Register built-in modules (import for side effect)
export { notesModule } from "./modules/notes/index";
export { catalogModule } from "./modules/catalog/index";

// tRPC
export {
  createContext,
  router,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
  adminProcedure,
  superAdminProcedure,
  createCallerFactory,
  requirePermission,
  requireModule,
  appRouter,
} from "./trpc/index";
export type { Context, AppRouter } from "./trpc/index";
