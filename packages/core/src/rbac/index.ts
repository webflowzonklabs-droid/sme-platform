import { hasPermission } from "@sme/shared";
import type { SYSTEM_ROLES } from "@sme/shared";

// ============================================
// RBAC — Role-Based Access Control
// ============================================

/**
 * Check if a user's role grants a specific permission.
 * Supports wildcards: *, module:*, module:resource:*
 */
export function checkPermission(
  userPermissions: string[],
  requiredPermission: string,
  _locationId?: string // Reserved for location-scoped permissions
): boolean {
  return hasPermission(userPermissions, requiredPermission);
}

/**
 * Check if a user's role grants ALL of the specified permissions.
 */
export function checkAllPermissions(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.every((p) => hasPermission(userPermissions, p));
}

/**
 * Check if a user's role grants ANY of the specified permissions.
 */
export function checkAnyPermission(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.some((p) => hasPermission(userPermissions, p));
}

/**
 * Get the default permissions for a system role, 
 * enhanced with module-specific permissions.
 */
export function buildRolePermissions(
  basePermissions: string[],
  modulePermissions: Record<string, string[]>,
  roleSlug: string
): string[] {
  const allPermissions = [...basePermissions];

  // Add module-specific permissions for this role
  for (const [_moduleId, rolePerms] of Object.entries(modulePermissions)) {
    const moduleRolePerms = rolePerms;
    if (moduleRolePerms) {
      allPermissions.push(...moduleRolePerms);
    }
  }

  return [...new Set(allPermissions)]; // Deduplicate
}

// Re-export for convenience
export { hasPermission };
