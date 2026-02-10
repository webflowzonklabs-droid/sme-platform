// ============================================
// Core Types — shared across all packages
// ============================================

/** Paginated response shape for cursor-based pagination */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

/** Pagination input — type alias (canonical definition in validators) */
// Note: PaginationInput is also exported from validators/index.ts via z.infer
// Use the validator version for runtime validation; this interface is kept for documentation.

/** Sort direction */
export type SortDirection = "asc" | "desc";

/** Sort input */
export interface SortInput<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

/** Standard API error shape */
export interface AppError {
  code: "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "INTERNAL";
  message: string;
  details?: unknown;
}

/** Auth method types */
export type AuthMethod = "password" | "pin" | "oauth";

/** Session context available in all authenticated requests */
export interface SessionContext {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: {
    id: string;
    slug: string;
    permissions: string[];
  };
}

/** Module navigation item */
export interface ModuleNavItem {
  label: string;
  icon: string;
  href: string;
  permission: string;
  children?: ModuleNavItem[];
}

/** Module definition shape */
export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  dependencies: string[];
  permissions: string[];
  roleDefaults: Record<string, string[]>;
  navigation: ModuleNavItem[];
}

/** Tenant settings stored in JSONB */
export interface TenantSettings {
  timezone?: string;
  currency?: string;
  locale?: string;
  dateFormat?: string;
  [key: string]: unknown;
}

/** Built-in system role slugs */
export const SYSTEM_ROLES = ["owner", "admin", "manager", "operator", "viewer"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Default permissions for system roles */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, string[]> = {
  owner: ["*"],
  admin: ["core:*", "settings:*"],
  manager: ["core:users:read", "core:dashboard:read"],
  operator: ["core:dashboard:read"],
  viewer: ["core:dashboard:read"],
};
