// ============================================
// Schema barrel — all tables exported from here
// ============================================

export { tenants, type Tenant, type NewTenant } from "./tenants";
export { users, type User, type NewUser } from "./users";
export { roles, type Role, type NewRole } from "./roles";
export {
  tenantMemberships,
  type TenantMembership,
  type NewTenantMembership,
} from "./tenant-memberships";
export { sessions, type Session, type NewSession } from "./sessions";
export {
  systemModules,
  tenantModules,
  type SystemModule,
  type NewSystemModule,
  type TenantModule,
  type NewTenantModule,
} from "./modules";
export { auditLogs, type AuditLog, type NewAuditLog } from "./audit-logs";

// Module schemas (included for migration generation)
export { notes, type Note, type NewNote } from "../../modules/notes/schema";
