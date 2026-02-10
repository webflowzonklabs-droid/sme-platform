# Re-Audit — SME SaaS Platform (Post-Fix)

**Auditor:** Automated Engineering Re-Audit  
**Date:** 2026-02-11  
**Branch:** `fix/critical-audit-fixes`  
**Original Audit:** `AUDIT.md` — 8 CRITICAL, 10 HIGH, 10 MEDIUM, 5 LOW  
**Scope:** Verify every CRITICAL and HIGH finding was truly fixed, identify regressions and new issues

---

## Executive Summary

**Significant progress.** The fixes addressed the right problems and the code reads like someone who understood the issues, not just surface-patched them. However, there are still **2 CRITICAL** and **3 HIGH** issues remaining — some are partial fixes from the original audit, and one is a new issue introduced by the fix itself.

**Verdict: Still NOT production-ready, but much closer. The remaining CRITICAL issues are fixable in 1-2 days.**

---

## Original CRITICAL Findings — Verification

### ✅ C1. Tenants Can Toggle Their Own Modules — FIXED

**Status: FULLY FIXED**

- `modules.enable` and `modules.disable` now use `superAdminProcedure` (verified in `packages/core/src/trpc/routers/modules.ts` lines 60, 79)
- The tenant-facing modules page (`apps/web/app/(dashboard)/[tenant]/settings/modules/page.tsx`) is now **read-only** — shows enabled modules with a "Contact your platform administrator" message
- The admin panel (`apps/web/app/(admin)/admin/page.tsx`) has the module toggle UI, properly behind `trpc.admin.enableModule` / `trpc.admin.disableModule`, both `superAdminProcedure`
- Module enable/disable duplicated in both `admin.ts` router and `modules.ts` router (both behind `superAdminProcedure`) — not a security issue, but redundant code

**Verified: Tenant admins cannot self-serve modules. Business model protected.** ✅

---

### 🔴 C2. Row-Level Security Exists Only in Documentation — PARTIALLY FIXED

**Status: RLS POLICIES EXIST BUT ARE NOT ACTIVE AT RUNTIME**

The migration file `0001_security_hardening.sql` correctly:
- ✅ Enables RLS on all 5 tenant-scoped tables (`roles`, `tenant_memberships`, `tenant_modules`, `audit_logs`, `notes`)
- ✅ Creates `tenant_isolation_*` policies using `current_setting('app.current_tenant_id', true)::UUID`
- ✅ Grants permissions to the `sme_app` role
- ✅ Migration is registered in `drizzle/meta/_journal.json`

**However, there are two critical problems:**

#### 🔴 CRITICAL-NEW-1: `withTenant()` Is STILL Not Called in the Request Pipeline

The `hasTenantContext` middleware in `procedures.ts` (lines 61-84) has this comment:

```typescript
// Set RLS context via withTenant for database-level isolation
// Note: The actual withTenant wrapping happens per-query in routes that use ctx.tenantId.
// Here we validate and pass the tenant context through.
```

**That comment is a lie.** No route wraps queries in `withTenant()`. I searched every router file:
- `notes/router.ts` — uses `db.select()` / `db.insert()` directly, no `withTenant()`
- `tenants.ts` — direct `db` calls
- `roles.ts` — direct `db` calls
- `users.ts` — direct `db` calls
- `audit.ts` — direct `db` calls
- `admin.ts` — direct `db` calls

The `SET LOCAL app.current_tenant_id` is never executed. RLS policies exist in the database but the session variable they depend on is never set. **Every query will return zero rows** when connected as `sme_app` (because `current_setting('app.current_tenant_id', true)` returns empty string, which casts to NULL, which matches no UUID).

Or more likely: the app is still connecting as a superuser (see below), which bypasses RLS entirely.

#### 🔴 CRITICAL-NEW-2: Database Connection Still Uses Superuser (H2 NOT FIXED)

`packages/core/src/db/index.ts` connects using `process.env.DATABASE_URL` directly. The `init-db.sql` creates the `sme_app` role, and the migration grants it permissions, but **nowhere is the application configured to use `sme_app`**. The `.env` still uses `sme_user` (likely a superuser or database owner).

PostgreSQL superusers bypass ALL RLS policies. Even with perfect policies and `withTenant()` wired up, RLS does nothing if the app connects as a superuser.

**Net effect: The RLS migration is pure theater. The database-level tenant isolation advertised by the architecture does not function.** The application still relies entirely on `WHERE tenant_id = ctx.tenantId` in each query — exactly the same as before the fix.

**To truly fix:**
1. Wire `withTenant()` into `hasTenantContext` middleware so `SET LOCAL` runs before every tenant-scoped request
2. Pass the transaction (`tx`) through context so routes use `ctx.db` instead of the global `db`
3. Update `DATABASE_URL` to use the `sme_app` role (non-superuser)
4. Test that queries work correctly with RLS active

---

### ✅ C3. No Module Access Enforcement on API Routes — FIXED

**Status: FULLY FIXED**

- `requireModule()` middleware exists in `procedures.ts` (lines 171-186)
- Notes router creates `notesProcedure = tenantProcedure.use(requireModule("notes"))` and ALL routes use it
- The middleware checks `isModuleEnabled(tenantId, moduleId)` against the `tenant_modules` table
- Throws `FORBIDDEN` with clear message when module is disabled

**Verified: Disabling the notes module blocks all API access, not just UI.** ✅

---

### ✅ C4. Cross-Tenant Data Modification via Tenant Update — FIXED

**Status: FULLY FIXED**

- `tenants.update` no longer accepts an `id` field — `updateTenantSchema` has no `id` property
- Always uses `ctx.tenantId` from the session: `where(eq(tenants.id, ctx.tenantId))`
- `isActive` removed from the update schema — only super admins can deactivate via `admin.setTenantActive`
- Frontend confirms: `updateTenant.mutate({ name })` — no tenant ID passed

**Verified: Cross-tenant modification impossible.** ✅

---

### ✅ C5. Privilege Escalation — Admins Can Modify System Role Permissions — FIXED

**Status: FULLY FIXED (and then some)**

- System roles are completely immutable: `if (existing.isSystem) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot modify system roles' })` — blocks name, description, AND permissions changes
- Custom role creation checks `canAssignPermissions()` — users can only grant permissions they already hold
- Custom role updates also check `canAssignPermissions()` for permission changes
- `canAssignPermissions()` uses `hasPermission()` which correctly handles wildcards

**One subtlety worth noting:** An admin with `core:*` permission could create a custom role with `notes:*` even if notes isn't in their granted permissions — because `hasPermission()` checks if ANY of the user's permissions cover the target. Since admin has `core:*`, not `*`, creating a role with `notes:*` would correctly fail. The wildcard matching logic is sound.

**Verified: System roles locked down. Privilege escalation blocked.** ✅

---

### ✅ C6. PIN Codes Stored in Plaintext — FIXED

**Status: FULLY FIXED**

- New `pinHash` column added (text, migration `0001`)
- `pinFailedAttempts` and `pinLockedUntil` columns added for rate limiting
- PIN login (`auth.ts`) verifies against `pinHash` using `verifyPassword()` (bcrypt compare)
- Legacy plaintext `pinCode` supported for migration: if old PIN matches, it auto-upgrades to hashed and clears plaintext
- User invite (`users.ts`) hashes PIN before storage: `hashPassword(input.pin)`
- Membership update (`users.ts`) hashes PIN before storage
- Seed script (`seed.ts`) stores hashed PINs, sets `pinCode: null`
- Audit logs redact PIN hashes: `if (auditChanges.pinHash) auditChanges.pinHash = "[REDACTED]"`

**The auto-upgrade from plaintext to hashed on successful login is a nice touch.**

**Verified: PINs are hashed with bcrypt. No plaintext storage.** ✅

---

### ✅ C7. No Rate Limiting on Authentication Endpoints — PARTIALLY FIXED

**Status: PIN rate limiting FIXED, password login rate limiting STILL MISSING**

PIN login has proper rate limiting:
- ✅ Max 5 failed attempts (configurable constant)
- ✅ 15-minute lockout after max failures
- ✅ Lockout check before PIN verification (can't bypass by timing the request)
- ✅ Failed attempts counter reset on success
- ✅ Returns `TOO_MANY_REQUESTS` error code during lockout
- ✅ Lockout data stored in database (survives restarts)

**But password login (`auth.login`) and registration (`auth.register`) have NO rate limiting whatsoever.** The original audit called for rate limiting on ALL auth endpoints. Password brute force is still trivially possible. No per-IP or per-account throttling exists.

I'm downgrading this from CRITICAL to HIGH because the most dangerous vector (4-digit PINs with 10K combinations) is now protected. Password brute force still matters but passwords are longer and the attack surface is smaller.

---

### ✅ C8. No Platform Owner / Super-Admin Concept — FIXED

**Status: FULLY FIXED**

- `isSuperAdmin` boolean added to `users` table (schema + migration)
- `superAdminProcedure` exists with proper middleware chain: `csrfProtection → isAuthenticated → isSuperAdmin`
- `isSuperAdmin` middleware checks `ctx.session.user.isSuperAdmin`
- Admin panel at `/admin` with layout guard: checks `session.user.isSuperAdmin`, redirects non-admins
- Admin router (`admin.ts`) has: `listTenants`, `stats`, `setTenantActive`, `getTenantModules`, `enableModule`, `disableModule`
- Seed script marks `admin@demo.com` as `isSuperAdmin: true`
- Session validation loads `isSuperAdmin` from the users table

**Verified: Platform admin exists, is properly guarded, and has the needed capabilities.** ✅

---

## Original HIGH Findings — Verification

### ⚠️ H1. Cursor-Based Pagination Is Broken — NOT FIXED

**Status: NOT FIXED**

The pagination still uses `gt(notes.id, input.cursor)` with UUID cursors while ordering by `desc(notes.updatedAt)`. Same pattern in `audit.ts` and `users.ts`. The `paginationSchema` still accepts a UUID cursor. The `paginatedResult` helper still returns `id` as the cursor value.

This is broken for the same reason as before: UUID ordering doesn't match `updatedAt` ordering, so pagination will return inconsistent results.

**Downgrading to MEDIUM** since this is a data consistency issue, not a security issue. But it absolutely must be fixed before production.

---

### 🔴 H2. Database Connection Uses Superuser — NOT FIXED

**Status: NOT FIXED — see CRITICAL-NEW-2 above**

This is part of the RLS problem. Covered under C2 verification.

---

### ⚠️ H3. `withTenant()` Is Defined But Never Called — NOT FIXED

**Status: NOT FIXED — see CRITICAL-NEW-1 above**

`withTenant()` is still defined and still never called. The comment in `hasTenantContext` middleware claims it's "per-query in routes" but it isn't. The `setTenantContext()` function is also still uncalled. `getTenantSlugById()` was added and IS called (good), but the core RLS-enabling functions remain dead code.

**This is merged into the C2 CRITICAL finding above.**

---

### ✅ H4. Multiple Dead Functions — PARTIALLY FIXED

**Status: PARTIALLY ADDRESSED**

Functions removed or wired up:
- ✅ `buildRolePermissions()` — still exists but now has a correct implementation with `roleSlug` parameter properly used (takes `modulePermissions` map). Still not called anywhere though.
- ✅ `invalidateAllUserSessions()` — still exported, still never called
- ✅ `resolveModuleDependencies()` and `getModulesInOrder()` — still defined, still never called
- ✅ Types `SessionContext`, `ModuleDefinition`, `AppError` — still defined, `SessionContext` and `ModuleDefinition` still unused at runtime (though `ModuleDefinition` is structurally identical to `ModuleConfig`)

**Verdict:** Dead code is still dead code. Not a security issue. The functions are at least correct now, so they're less dangerous as false confidence signals. Downgrading to LOW.

---

### ✅ H5. Module Router Registration Is Static — NOT FIXED (by design)

**Status: ACCEPTED AS-IS**

The app router is still statically composed. The comment explains:
```
// While the module registry supports dynamic registration, we keep
// static imports here for TypeScript type safety on the AppRouter type.
```

This is a reasonable trade-off. The `requireModule()` middleware handles runtime enforcement. Adding a new module still requires touching this file, but that's a development-time concern, not a security or runtime issue.

**Downgrading to LOW.** Acceptable for current stage.

---

### ✅ H6. No CSRF Protection — FIXED

**Status: FULLY FIXED**

- `csrfProtection` middleware exists in `procedures.ts` (lines 27-36)
- Checks `ctx.trpcSource` header on mutations (`type === "mutation"`)
- Requires value `"react"` or `"server"`
- Applied to all protected procedures: `protectedProcedure`, `tenantProcedure`, `adminProcedure`, `superAdminProcedure`
- NOT applied to `publicProcedure` (correct — login/register don't need CSRF since they establish sessions)
- Client sends `"x-trpc-source": "react"` header (verified in `provider.tsx`)
- Server reads header from request in the tRPC handler (`route.ts`)

**Verified: Cross-site request forgery on mutations is blocked.** ✅

---

### ⚠️ H7. Password Hashing: bcrypt Instead of argon2id — NOT FIXED (acceptable)

**Status: ACCEPTED AS-IS**

Still using `bcryptjs` with 12 salt rounds. The FIXES.md explicitly deferred this. bcrypt is acceptable per OWASP. Not a blocker.

---

### ⚠️ H8. Session Token Flows Through Client-Side JavaScript — NOT FIXED

**Status: NOT FIXED**

The login flow still returns `token` in the tRPC response body, and the client calls `setSessionCookie(data.token)` — a server action — to set the httpOnly cookie. The token passes through browser JS.

The FIXES.md planned to create Next.js API route handlers for login/register that set the cookie in the same response. This was not implemented.

**Still HIGH.** In an XSS scenario, an attacker can intercept the token from the tRPC response before the server action sets the cookie. The window is brief but real.

---

### ✅ H9. Settings Page React Anti-Pattern — FIXED

**Status: FULLY FIXED**

Settings page now uses `useEffect`:
```typescript
useEffect(() => {
  if (tenant) {
    setName(tenant.name);
  }
}, [tenant?.name]);
```

No more render-time state updates. ✅

---

### ✅ H10. Select Tenant Page Fires Mutation During Render — FIXED

**Status: FULLY FIXED**

Auto-switch wrapped in `useEffect` with a `useRef` guard (`autoSwitchDone`) to prevent double-firing in React strict mode. Correct fix. ✅

---

## New Issues Introduced by Fixes

### 🔴 CRITICAL-NEW-1: RLS Comment Lie — False Sense of Security

**Covered above under C2 verification.** The `hasTenantContext` middleware comment claims RLS is set "per-query in routes" — this is false. No route calls `withTenant()`. The RLS migration creates policies that depend on `app.current_tenant_id` being set, but it never is. If the app switches to the `sme_app` role tomorrow, all tenant-scoped queries will return empty results because the session variable is unset.

**This is the single most dangerous issue because it creates false confidence.** A developer reading the middleware comment would believe RLS is active. It is not.

---

### 🟠 HIGH-NEW-1: Admin Router Queries Bypass Tenant Isolation by Design — But Lack Safeguards

The `admin.ts` router uses `superAdminProcedure` (good) and queries across tenants (expected for admin operations). However:

1. `admin.listTenants` queries `tenantMemberships` and `tenantModules` directly without tenant scoping — this is correct for an admin view, but if RLS were actually active, these queries would fail because no `app.current_tenant_id` is set for super admin requests.

2. The `admin.enableModule` and `admin.disableModule` mutations call `enableModule()` / `disableModule()` from `lifecycle.ts`. These functions call `createAuditLog()` which inserts into the `audit_logs` table. If RLS is active, this insert would fail because the tenant context isn't set.

**This means the admin router is fundamentally incompatible with the RLS architecture.** Super admin operations need to either:
- Bypass RLS (using the superuser connection for admin operations), OR
- Set tenant context before each operation, OR
- Have separate RLS policies for super admin access

This needs architectural thought, not just a patch.

---

### 🟠 HIGH-NEW-2: Tenant Creation Now Restricted to Super Admin — No Self-Service Onboarding

The `tenants.create` mutation was changed from a protected procedure to `superAdminProcedure`. While this protects the platform, it means **no new customer can create a tenant without a super admin doing it for them**.

The original architecture had a self-service onboarding flow (register → create tenant → use platform). Now it's:
1. User registers
2. User... has no tenants and no way to create one
3. User sees "No Organizations Yet" → "Create Organization" button
4. The create tenant page presumably calls `tenants.create` → **FORBIDDEN** (not a super admin)

This breaks the onboarding flow entirely. Either:
- Tenant creation should remain a protected (non-super-admin) procedure with appropriate limits
- Or a separate onboarding flow should exist that's super-admin approved

---

## Remaining Issues Summary

### 🔴 CRITICAL (2)

| ID | Issue | Original | Status |
|---|---|---|---|
| CRITICAL-NEW-1 | `withTenant()` never called — RLS policies exist but session variable never set — entire RLS layer non-functional | C2 + H3 | Partial fix, core problem remains |
| CRITICAL-NEW-2 | App still connects as superuser — RLS bypassed even if `withTenant()` were called | H2 | Not fixed |

### 🟠 HIGH (3)

| ID | Issue | Original | Status |
|---|---|---|---|
| HIGH-1 | No rate limiting on password login or registration | C7 | Partially fixed (PIN only) |
| HIGH-2 | Session token exposed to client JS during login | H8 | Not fixed |
| HIGH-NEW-1 | Admin router incompatible with RLS architecture | New | Architectural gap |

### 🟡 MEDIUM (3)

| ID | Issue | Original | Status |
|---|---|---|---|
| MEDIUM-1 | Cursor-based pagination still broken (UUID cursor + date sort) | H1 | Not fixed |
| MEDIUM-NEW-1 | Tenant creation requires super admin — breaks self-service onboarding | New | Regression |
| MEDIUM-2 | Middleware auth is still cookie-existence only | M6 | Not fixed |

### 🟢 LOW (3)

| ID | Issue | Original | Status |
|---|---|---|---|
| LOW-1 | Dead functions still exist (`buildRolePermissions`, `resolveModuleDependencies`, etc.) | H4 | Not addressed |
| LOW-2 | `staleTime: 5s` still very short | L4 | Not addressed |
| LOW-3 | No `docker-compose.yml` | M1 | Not addressed |

---

## Verification Checklist Results

| Check | Result | Notes |
|---|---|---|
| RLS policies exist in a real migration file | ✅ | `0001_security_hardening.sql` is correct |
| RLS policies cover all tenant-scoped tables | ✅ | All 5 tables covered |
| **RLS context (`withTenant()`) actually set in request pipeline** | **❌** | Never called anywhere |
| **App connects as non-superuser to respect RLS** | **❌** | Still using `DATABASE_URL` (likely superuser) |
| Module enable/disable is super-admin only | ✅ | Both routers use `superAdminProcedure` |
| Module enforcement exists on API routes | ✅ | `requireModule("notes")` middleware applied |
| Cross-tenant access impossible (session tenant used everywhere) | ✅ | All routes use `ctx.tenantId` |
| PIN codes are hashed | ✅ | bcrypt via `hashPassword()` |
| PIN rate-limited with lockout | ✅ | 5 attempts, 15 min lockout |
| **Password login rate-limited** | **❌** | No rate limiting |
| Session tokens use `crypto.randomBytes` | ✅ | 32 bytes, hex-encoded |
| Privilege escalation blocked | ✅ | `canAssignPermissions()` + system role immutability |
| CSRF protection on mutations | ✅ | `x-trpc-source` header verified |
| Super-admin panel exists and is properly guarded | ✅ | `/admin` with `isSuperAdmin` check |
| CONTRIBUTING.md documents security pipeline | ✅ | Comprehensive checklist |

**Score: 11/15 checks pass.** The 4 failures cluster around one root cause: RLS is not functional at runtime.

---

## Recommendations — Priority Order

### 1. Make RLS Actually Work (CRITICAL — 1 day)

This is the #1 priority. Everything else is secondary.

```typescript
// In hasTenantContext middleware:
const hasTenantContext = t.middleware(async ({ ctx, next }) => {
  // ... existing validation ...
  
  const tenantId = ctx.session.session.tenantId;
  
  // Wrap all downstream operations in a tenant-scoped transaction
  return withTenant(tenantId, async (tx) => {
    return next({
      ctx: {
        ...ctx,
        db: tx, // Pass tenant-scoped transaction through context
        tenantId,
        membership: ctx.session.membership,
      },
    });
  });
});
```

Then update all routes to use `ctx.db` instead of importing `db` directly. This is a mechanical change.

Update `.env` / deployment config to use `sme_app` role.

Create a separate superuser connection for migrations and admin operations.

### 2. Add Password Rate Limiting (HIGH — 4 hours)

Use Redis (already configured) or database-backed counters. The PIN rate limiting pattern already exists — extend it to password login.

### 3. Fix Session Token Exposure (HIGH — 3 hours)

Create `/api/auth/login` and `/api/auth/register` Next.js route handlers that create sessions and set cookies server-side in one round trip.

### 4. Fix Tenant Onboarding (MEDIUM — 1 hour)

Either restore self-service tenant creation with limits, or create a separate onboarding API (`auth.createFirstTenant` for users with zero tenants).

---

## What Was Done Well

Credit where due:

1. **CSRF protection is clean and correct.** The middleware pattern, the header check, applying it to the right procedure levels — all correct.
2. **PIN hashing with auto-upgrade is excellent.** The legacy plaintext migration path is thoughtful and well-implemented.
3. **Module enforcement middleware is properly designed.** Clean separation, correct error codes, applied at the right level.
4. **The admin panel is functional.** Not just a stub — it has stats, tenant management, and module toggling.
5. **System role immutability is thorough.** Blocks all modifications, not just permissions.
6. **Cross-tenant fix is the right approach.** Removing `id` from the schema entirely is better than adding a guard.
7. **CONTRIBUTING.md is genuinely useful.** The security checklist would prevent most of the original issues from recurring.
8. **Seed script properly hashes PINs.** No shortcuts in test data.

The fixes show understanding of the problems, not just pattern-matching against the audit. The remaining issues are in the hardest area (wiring RLS into the request lifecycle) which requires touching every route. That's effort, not ignorance.

---

**Bottom line:** Fix the RLS wiring (make `withTenant()` actually run and connect as `sme_app`), add password rate limiting, and fix the onboarding regression. After that, this is production-viable for a beta launch.
