import { z } from "zod";

// ============================================
// Common Validators — reused everywhere
// ============================================

/** UUID v4 validator */
export const uuidSchema = z.string().uuid();

/** Email validator */
export const emailSchema = z.string().email().max(255).toLowerCase().trim();

/** Password validator — min 8 chars, at least 1 letter + 1 number */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/** PIN code — 4-6 digits */
export const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, "PIN must be 4-6 digits");

/** Full name validator */
export const fullNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(200, "Name must be at most 200 characters")
  .trim();

/** Tenant slug — lowercase, alphanumeric + hyphens */
export const tenantSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(100, "Slug must be at most 100 characters")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen")
  .transform((v) => v.toLowerCase());

/** Tenant name */
export const tenantNameSchema = z
  .string()
  .min(1, "Tenant name is required")
  .max(200, "Tenant name must be at most 200 characters")
  .trim();

/** Cursor-based pagination input */
export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

/** Sort direction */
export const sortDirectionSchema = z.enum(["asc", "desc"]);

/** Permission string format: module:resource:action or wildcard */
export const permissionSchema = z
  .string()
  .regex(
    /^(\*|[a-z]+:\*|[a-z]+:[a-z]+:\*|[a-z]+:[a-z]+:[a-z]+)$/,
    "Permission must be in format module:resource:action (wildcards allowed)"
  );

// ============================================
// Auth Schemas
// ============================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

export const pinLoginSchema = z.object({
  tenantId: uuidSchema,
  userId: uuidSchema,
  pin: pinSchema,
});

// ============================================
// Tenant Schemas
// ============================================

export const createTenantSchema = z.object({
  name: tenantNameSchema,
  slug: tenantSlugSchema,
  settings: z.record(z.unknown()).optional(),
});

export const updateTenantSchema = z.object({
  id: uuidSchema,
  name: tenantNameSchema.optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// Role Schemas
// ============================================

export const createRoleSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  permissions: z.array(permissionSchema),
});

export const updateRoleSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(50).trim().optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(permissionSchema).optional(),
});

// ============================================
// User Schemas
// ============================================

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  roleId: uuidSchema,
  pin: pinSchema.optional(),
});

export const updateMembershipSchema = z.object({
  membershipId: uuidSchema,
  roleId: uuidSchema.optional(),
  pin: pinSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

// ============================================
// Module Schemas
// ============================================

export const enableModuleSchema = z.object({
  moduleId: z.string().min(1).max(50),
  config: z.record(z.unknown()).optional(),
});

export const disableModuleSchema = z.object({
  moduleId: z.string().min(1).max(50),
});

// ============================================
// Type exports from validators
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PinLoginInput = z.infer<typeof pinLoginSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type EnableModuleInput = z.infer<typeof enableModuleSchema>;
export type DisableModuleInput = z.infer<typeof disableModuleSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
