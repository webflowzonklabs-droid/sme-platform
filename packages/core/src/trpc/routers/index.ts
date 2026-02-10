import { router } from "../procedures";
import { authRouter } from "./auth";
import { tenantsRouter } from "./tenants";
import { usersRouter } from "./users";
import { rolesRouter } from "./roles";
import { modulesRouter } from "./modules";
import { auditRouter } from "./audit";
import { notesRouter } from "../../modules/notes/router";

// ============================================
// Root App Router — all core routes + module routes
// ============================================

export const appRouter = router({
  // Core routes
  auth: authRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  roles: rolesRouter,
  modules: modulesRouter,
  audit: auditRouter,

  // Module routes (registered at startup)
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
