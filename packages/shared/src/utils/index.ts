// ============================================
// Shared Utilities
// ============================================

/** Generate a URL-safe slug from a string */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Check if a permission matches against a set of granted permissions.
 *  Supports wildcards: `*` matches everything, `module:*` matches all in module,
 *  `module:resource:*` matches all actions on a resource.
 */
export function hasPermission(
  grantedPermissions: string[],
  requiredPermission: string
): boolean {
  // Full wildcard — superadmin
  if (grantedPermissions.includes("*")) return true;

  // Direct match
  if (grantedPermissions.includes(requiredPermission)) return true;

  // Check wildcard matches
  const parts = requiredPermission.split(":");

  // module:* — matches anything in that module
  if (parts.length >= 2 && grantedPermissions.includes(`${parts[0]}:*`)) {
    return true;
  }

  // module:resource:* — matches any action on that resource
  if (
    parts.length === 3 &&
    grantedPermissions.includes(`${parts[0]}:${parts[1]}:*`)
  ) {
    return true;
  }

  return false;
}

/** Format a date for display (ISO string or Date → readable) */
export function formatDate(date: Date | string, locale = "en-PH"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a date with time */
export function formatDateTime(date: Date | string, locale = "en-PH"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Safely parse JSON, returns null on failure */
export function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/** Generate a random token (hex string) */
export function generateToken(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash a token using SHA-256 for storage */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a cursor-based pagination result */
export function paginatedResult<T extends { id: string }>(
  items: T[],
  limit: number
): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : null;
  return { data, nextCursor, hasMore };
}
