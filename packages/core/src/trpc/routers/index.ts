import { router } from "../procedures";
import { authRouter } from "./auth";
import { tenantsRouter } from "./tenants";
import { usersRouter } from "./users";
import { rolesRouter } from "./roles";
import { modulesRouter } from "./modules";
import { auditRouter } from "./audit";
import { adminRouter } from "./admin";
import { notesRouter } from "../../modules/notes/router";
import { catalogRouter } from "../../modules/catalog/router";

// Side-effect imports: register modules in the in-memory registry
// so getModule() / getModuleRegistry() return navigation, permissions, etc.
import "../../modules/notes/index";
import "../../modules/catalog/index";

// ============================================
// Root App Router — all core routes + module routes
// ============================================
// Module routers are imported from the module registry pattern.
// While the module registry supports dynamic registration, we keep
// static imports here for TypeScript type safety on the AppRouter type.
// The requireModule() middleware on each module router handles enforcement.
// New modules should be added here AND registered via defineModule().

export const appRouter = router({
  // Core routes
  auth: authRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  roles: rolesRouter,
  modules: modulesRouter,
  audit: auditRouter,
  admin: adminRouter,

  // Module routes (statically imported for type safety, 
  // enforced at runtime via requireModule() middleware)
  notes: notesRouter,
  catalog: catalogRouter,
});

export type AppRouter = typeof appRouter;
