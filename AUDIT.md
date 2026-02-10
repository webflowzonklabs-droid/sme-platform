# Security & Architecture Audit — SME SaaS Platform

**Auditor:** Automated Engineering Audit  
**Date:** 2026-02-11  
**Codebase:** ~77 files, ~6,500 lines  
**Verdict:** NOT PRODUCTION-READY. Multiple critical flaws must be fixed before exposing this to real businesses.

---

## 🔴 CRITICAL — Must fix before any real use

### C1. Tenants Can Toggle Their Own Modules On/Off

**Files:** `packages/core/src/trpc/routers/modules.ts` (lines 42-57, 62-77), `apps/web/app/(dashboard)/[tenant]/settings/modules/page.tsx`

**What's wrong:** The `modules.enable` and `modules.disable` endpoints use `adminProcedure`, which means any tenant admin or owner can freely enable/disable modules for their own tenant. The UI gives them a Switch toggle to do so.

**Why it matters:** This is the monetization model. The platform owner sells module access to tenants. If tenants can enable modules themselves, they get the product for free. This isn't a bug — it's a business model failure. Every tenant admin will enable everything day one.

**Fix:** 
- Remove the module toggle UI from tenant settings entirely
- Change `modules.enable` and `modules.disable` to require a super-admin / platform-owner role (which doesn't exist yet — see C8)
- Add a platform admin panel where only the platform owner can manage which modules are enabled per tenant

---

### C2. Row-Level Security (RLS) Exists Only in Documentation

**Files:** `packages/core/drizzle/0000_purple_chronomancer.sql` (the entire migration), `packages/core/src/tenant/index.ts`

**What's wrong:** The architecture doc describes detailed RLS policies. The generated migration SQL contains **zero** RLS statements — no `ENABLE ROW LEVEL SECURITY`, no `CREATE POLICY`. Nothing. The `withTenant()` function that sets `app.current_tenant_id` via `SET LOCAL` is defined but **never called anywhere in the codebase**. All tenant isolation relies exclusively on application-level `WHERE tenant_id = ctx.tenantId` clauses in each query.

**Why it matters:** If any developer adds a new query and forgets the `WHERE tenant_id` filter, data leaks across tenants. There is no database-level safety net. In a multi-tenant SaaS, this is the difference between "one bug causes inconvenience" and "one bug causes a lawsuit." The architecture doc sold the security of RLS; the implementation delivers none of it.

**Fix:**
1. Add RLS policies to a new migration for all tenant-scoped tables (`roles`, `tenant_memberships`, `tenant_modules`, `audit_logs`, `notes`)
2. Create a non-superuser application role (the `sme_app` role in `scripts/init-db.sql` was created for this but is never used)
3. Connect the app via the non-superuser role (superusers bypass RLS)
4. Call `withTenant()` in the tRPC context or middleware so every query runs within a tenant-scoped transaction
5. Keep the application-level WHERE clauses as defense-in-depth, but RLS must be the primary guard

---

### C3. No Module Access Enforcement on API Routes

**Files:** `packages/core/src/trpc/routers/index.ts` (line 14), `packages/core/src/modules/notes/router.ts`

**What's wrong:** The notes router is unconditionally mounted on the root app router: `notes: notesRouter`. There is no middleware checking whether the `notes` module is enabled for the current tenant before allowing API access. Disabling a module only removes the `tenant_modules` row and hides navigation — the API endpoints remain fully functional.

**Why it matters:** A tenant with the notes module "disabled" can still call `notes.create`, `notes.list`, etc. and it all works. Module access control is cosmetic (UI-only), not enforced. This also means the permission system for modules is security theater — the gate is open, the guard is just a sign.

**Fix:** Create a `requireModule(moduleId)` middleware that checks `isModuleEnabled(ctx.tenantId, moduleId)` before proceeding. Apply it to every module router. Example:
```typescript
export function requireModule(moduleId: string) {
  return t.middleware(async ({ ctx, next }) => {
    const enabled = await isModuleEnabled(ctx.tenantId, moduleId);
    if (!enabled) throw new TRPCError({ code: 'FORBIDDEN', message: `Module "${moduleId}" is not enabled` });
    return next({ ctx });
  });
}
```

---

### C4. Cross-Tenant Data Modification via Tenant Update

**File:** `packages/core/src/trpc/routers/tenants.ts` (lines 70-100, the `update` mutation)

**What's wrong:** The `tenants.update` mutation takes `input.id` (the tenant UUID to update) and uses `adminProcedure` to verify the caller is an admin. But `adminProcedure` only checks that the user is an admin in their *current* tenant — it does NOT verify that `input.id` matches `ctx.tenantId`. An admin of Tenant A can update Tenant B's name, settings, or even deactivate it by passing Tenant B's UUID.

**Why it matters:** Any tenant admin can vandalize or deactivate any other tenant on the platform. One malicious or compromised admin account can take down every customer.

**Fix:** Add a check: `if (input.id !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })`. Or better: remove `id` from the input and always use `ctx.tenantId`.

---

### C5. Privilege Escalation — Admins Can Modify System Role Permissions

**File:** `packages/core/src/trpc/routers/roles.ts` (lines 73-107, the `update` mutation)

**What's wrong:** The `roles.update` mutation prevents renaming system roles (`if (existing.isSystem && input.name)`) but freely allows updating their permissions. A tenant admin can:
1. Update the `owner` role to have zero permissions (locking out the owner)
2. Update their own `admin` role to have `["*"]` (wildcard — full superadmin)
3. Update the `viewer` role to have `["*"]` (escalating any viewer to superadmin)

**Why it matters:** The RBAC system is meaningless if admins can rewrite the permission matrix. Any admin can make themselves an owner-equivalent, or worse, strip the owner's permissions. System role permissions should be immutable.

**Fix:** Block permission updates on system roles: `if (existing.isSystem && input.permissions) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot modify system role permissions' })`. Alternatively, only allow the platform owner to modify system role permissions.

---

### C6. PIN Codes Stored in Plaintext

**Files:** `packages/core/src/db/schema/tenant-memberships.ts` (line 14), `packages/core/src/trpc/routers/auth.ts` (lines 94-97)

**What's wrong:** PIN codes are stored as `varchar(10)` plaintext in the `tenant_memberships` table. The PIN login compares `membership.pinCode !== input.pin` — a direct string comparison. Anyone with database read access (DBAs, backups, SQL injection, leaked credentials) sees every user's PIN.

**Why it matters:** PINs are authentication credentials. They must be hashed like passwords. In the Philippines, where this platform targets, many SME employees reuse PINs across systems (ATM, phone lock, etc.). A leaked database exposes personal PINs.

**Fix:** Hash PINs with bcrypt (or better, argon2id) before storage. On PIN login, use `verifyPassword(input.pin, membership.pinHashedCode)`. This also prevents timing attacks on the current string comparison.

---

### C7. No Rate Limiting on Authentication Endpoints

**Files:** `packages/core/src/trpc/routers/auth.ts` (all of it)

**What's wrong:** Zero rate limiting on login, register, and PIN login endpoints. No lockout after failed attempts. No CAPTCHA. Nothing.

**Why it matters:** 
- **Password brute force:** Automated tools can try thousands of passwords per minute.
- **PIN brute force:** A 4-digit PIN has only 10,000 possible values. At 100 requests/second (trivial), every PIN is cracked in under 2 minutes. 6-digit PINs: under 3 hours.
- **Registration spam:** Bots can create unlimited accounts.

**Fix:** Implement rate limiting per IP and per account. Redis (already in the env vars but not used) is perfect for this. Minimum: 5 failed logins → 15 minute lockout. For PINs: 3 failed attempts → 1 hour lockout + alert the tenant admin.

---

### C8. No Platform Owner / Super-Admin Concept

**Files:** Entire codebase — the concept simply doesn't exist

**What's wrong:** The architecture describes a clear separation between "platform owner" (who sells the SaaS) and "tenant owners" (who run their businesses). The codebase has no super-admin concept at all. There's no admin panel (`apps/admin/` from the architecture doc doesn't exist), no way to manage tenants from a platform-owner perspective, no billing controls.

**Why it matters:** Without this, the platform owner has no way to:
- Control which tenants get which modules (C1)
- Deactivate tenants that don't pay
- View platform-wide analytics
- Manage system-wide settings
- Handle support escalations

The entire business model requires this. Without it, this is a self-service multi-tenant app where everyone is equal — not a SaaS.

**Fix:** 
1. Add an `isPlatformAdmin` flag to the `users` table (or a separate `platform_roles` table)
2. Create a `platformAdminProcedure` that checks this flag
3. Move module enable/disable, tenant management, and system configuration behind this procedure
4. Build the admin panel (even a minimal one)

---

## 🟠 HIGH — Should fix soon

### H1. Cursor-Based Pagination Is Broken

**Files:** `packages/core/src/modules/notes/router.ts` (line 30), `packages/core/src/trpc/routers/audit.ts` (line 38), `packages/core/src/trpc/routers/users.ts` (line 34)

**What's wrong:** Pagination uses `gt(notes.id, input.cursor)` (UUID comparison) but orders by `desc(notes.updatedAt)`. Cursor-based pagination only works when the cursor field matches the sort field. UUIDs are randomly generated — `gt()` on UUIDs doesn't correspond to any meaningful ordering. The next page will return random subsets of data, skip items, or duplicate items.

**Why it matters:** Users will see inconsistent lists. Items will disappear and reappear as they paginate. For business data (inventory, transactions), this means operators can't trust the list view.

**Fix:** Use `updatedAt` (or `createdAt`) as the cursor value instead of `id`. The cursor should be the sort field's value of the last returned item. For tie-breaking, include `id` as a secondary sort.

---

### H2. Database Connection Uses Superuser — RLS Bypass

**Files:** `.env` (line 1), `scripts/init-db.sql`

**What's wrong:** The app connects as `sme_user` via `DATABASE_URL`, which is likely a superuser or at least the database owner. The `scripts/init-db.sql` creates an `sme_app` role specifically designed for RLS compliance, but it's never used. PostgreSQL superusers bypass ALL RLS policies.

**Why it matters:** Even if you add RLS policies (fixing C2), they won't work until the application connects with a non-superuser role. The init script created the role but nobody wired it up.

**Fix:** After adding RLS policies, update `DATABASE_URL` to use the `sme_app` role, and ensure that role has appropriate grants but is NOT a superuser.

---

### H3. `withTenant()` Is Defined But Never Called — Dead Code

**File:** `packages/core/src/tenant/index.ts`

**What's wrong:** The `withTenant()` function wraps database operations in a transaction with tenant context for RLS. It is exported and documented but called exactly zero times in the entire codebase. Same for `setTenantContext()`.

**Why it matters:** This is a textbook "AI appeasement" pattern — code that looks like it implements a critical feature but is never actually wired up. It gives false confidence during code review. "Oh, we have RLS context setting" — except it never runs.

**Fix:** Either wire it into the tRPC context/middleware so every request runs within a tenant transaction, or remove it to avoid the false sense of security.

---

### H4. Multiple Dead Functions — AI Appeasement Pattern

**Files:**
- `packages/core/src/rbac/index.ts` — `buildRolePermissions()` is defined but never called anywhere. The `roleSlug` parameter isn't even used in the function body.
- `packages/core/src/modules/registry.ts` — `resolveModuleDependencies()` and `getModulesInOrder()` are defined but never called.
- `packages/shared/src/types/index.ts` — `SessionContext`, `ModuleDefinition`, `AppError` types are defined but never used.
- `packages/core/src/auth/session.ts` — `invalidateAllUserSessions()` is exported but never called.

**Why it matters:** Dead code creates maintenance burden and false confidence. These functions suggest features are implemented when they aren't. Future developers will assume dependency resolution runs at startup (it doesn't), that session invalidation works globally (nobody calls it), and that role permissions are built dynamically (they aren't).

**Fix:** Either wire these functions into actual code paths, or delete them with a comment explaining what's needed for production.

---

### H5. Module Router Registration Is Static, Not Dynamic

**File:** `packages/core/src/trpc/routers/index.ts`

**What's wrong:** Despite the `defineModule()` system and module registry, the actual tRPC router is statically composed:
```typescript
export const appRouter = router({
  notes: notesRouter, // hardcoded import
});
```
Adding a new module (e.g., inventory) requires manually importing and adding it to this file. The module registry's `router` field is typed as `any` and never consumed.

**Why it matters:** The module system promises plug-and-play modularity. In reality, every new module requires touching core code. This defeats the purpose of the module system architecture.

**Fix:** Build the app router dynamically from the module registry. Loop over registered modules and merge their routers into the root router at startup. tRPC v11 supports `router.merge()` or dynamic composition.

---

### H6. No CSRF Protection

**Files:** `apps/web/app/api/trpc/[trpc]/route.ts`, `apps/web/src/lib/auth.ts`

**What's wrong:** The app uses httpOnly cookies for authentication. tRPC over HTTP with cookie auth is vulnerable to CSRF. A malicious website could make requests to `/api/trpc/tenants.update` and the browser would include the session cookie. The `sameSite: "lax"` cookie attribute helps for cross-origin POST requests but doesn't prevent attacks from subdomains, and tRPC queries use GET by default.

**Why it matters:** An attacker could craft a page that, when visited by an authenticated user, makes mutations on their behalf — updating settings, deleting data, or inviting malicious users.

**Fix:** Add a custom header check (e.g., `X-TRPC-Source: react`) and verify it server-side. Browsers won't send custom headers in cross-origin requests without CORS preflight. The header is already being sent by the client (`provider.tsx` line 31) but never verified server-side.

---

### H7. Password Hashing: bcrypt Instead of argon2id

**File:** `packages/core/src/auth/password.ts`

**What's wrong:** The architecture doc specifies `argon2id` for password hashing. The implementation uses `bcryptjs` (pure JavaScript bcrypt). The `argon2` package is listed in `pnpm.onlyBuiltDependencies` (root `package.json`) but not in any `dependencies`. The README honestly says "bcryptjs" but the design doc says argon2id.

**Why it matters:** bcrypt is acceptable but argon2id is the current recommendation (OWASP 2024). More importantly, `bcryptjs` is a pure-JS implementation — significantly slower than native bcrypt, which means either you accept slow auth responses or you use lower salt rounds (weakening security). The 12 rounds used here is fine for native bcrypt but will be noticeably slow in pure JS.

**Fix:** Switch to `argon2` (native binding) as the architecture intended. It's faster, more secure, and memory-hard (resists GPU attacks). The `onlyBuiltDependencies` config already expects it.

---

### H8. Session Token Flows Through Client-Side JavaScript

**Files:** `packages/core/src/trpc/routers/auth.ts` (returns `token` in response), `apps/web/app/(auth)/login/page.tsx` (receives token), `apps/web/src/lib/auth.ts` (server action sets cookie)

**What's wrong:** The auth flow returns the raw session token in the tRPC response body, which the client-side JavaScript receives, then passes to a server action (`setSessionCookie()`) to set as an httpOnly cookie. The token passes through the browser's JavaScript runtime.

**Why it matters:** In an XSS attack, the attacker's script can intercept the token from the tRPC response before it becomes an httpOnly cookie. The window of exposure is brief but real. A production auth system should set the cookie server-side in the same request that creates the session.

**Fix:** Implement login as a Next.js server action or API route handler that creates the session AND sets the cookie in a single server-side round trip, never exposing the token to client JS.

---

### H9. Settings Page React Anti-Pattern — Render-Time State Update

**File:** `apps/web/app/(dashboard)/[tenant]/settings/page.tsx` (line 24)

**What's wrong:** 
```typescript
if (tenant && !name) {
  setName(tenant.name);
}
```
This calls `setState` during render, which is a React anti-pattern that causes unnecessary re-renders. If `tenant.name` is an empty string (falsy), this creates an infinite render loop. Even without the loop, it causes a flash of empty state.

**Why it matters:** At best: double render and stale data flash. At worst: infinite loop that freezes the browser tab. Both look unprofessional.

**Fix:** Use `useEffect` with `tenant.name` as dependency, or initialize state from the query's default value.

---

### H10. Select Tenant Page Fires Mutation During Render

**File:** `apps/web/app/(auth)/select-tenant/page.tsx` (lines 30-36)

**What's wrong:** When a user has exactly one tenant, `switchTenant.mutate()` is called directly in the component body (not in `useEffect`). This fires the mutation on every re-render. React strict mode in development will double-invoke this.

**Why it matters:** Multiple session updates fired simultaneously can cause race conditions. The user sees flickering UI as the mutation fires repeatedly.

**Fix:** Wrap the auto-switch logic in a `useEffect`.

---

## 🟡 MEDIUM — Fix before production

### M1. No docker-compose.yml

**File:** Missing — referenced in README but doesn't exist

**What's wrong:** The README tells users to run `docker compose up -d` as step 2 of setup. There's no `docker-compose.yml` file in the repo.

**Why it matters:** Fresh clone fails immediately. First impressions for potential contributors or evaluators. Shows the project wasn't actually tested from a clean checkout.

**Fix:** Add a `docker-compose.yml` with PostgreSQL 16 and Redis services.

---

### M2. LIKE Injection in Search Inputs

**Files:** `packages/core/src/modules/notes/router.ts` (line 24), `packages/core/src/trpc/routers/users.ts` (line 30)

**What's wrong:** Search inputs are interpolated into LIKE patterns: `ilike(notes.title, \`%${input.search}%\`)`. While Drizzle parameterizes the value (preventing SQL injection), special LIKE characters (`%`, `_`) in user input act as wildcards. A search for `%` returns all records; `_` matches any single character.

**Why it matters:** Users can bypass intended search behavior. Not a security risk per se, but unexpected behavior that makes the search unreliable.

**Fix:** Escape LIKE special characters in the search input before building the pattern: `input.search.replace(/[%_\\]/g, '\\$&')`.

---

### M3. No Expired Session Cleanup

**Files:** `packages/core/src/db/schema/sessions.ts`, entire codebase (no cleanup job)

**What's wrong:** Sessions have an `expiresAt` column and expired sessions are filtered out in `validateSession()`, but expired rows are never deleted. The architecture mentions Redis for sessions, but sessions are only stored in PostgreSQL.

**Why it matters:** The sessions table grows forever. After months of operation, it will contain millions of expired session rows, degrading query performance. This is a slow-burn performance issue.

**Fix:** Add a scheduled job (cron or BullMQ) that runs `DELETE FROM sessions WHERE expires_at < NOW()` periodically (e.g., daily). Or switch to Redis for session storage as the architecture intended.

---

### M4. Tenant Slug Not Validated Against Session

**File:** `apps/web/app/(dashboard)/[tenant]/layout.tsx`

**What's wrong:** The dashboard layout extracts `tenantSlug` from the URL but never verifies it matches the tenant in the user's session. A user authenticated to tenant "demo" can visit `/other-company/` and see the dashboard shell. The data is still from "demo" (because queries use `ctx.tenantId`), but the URL says "other-company".

**Why it matters:** Confusing for users — the URL says one thing, the data shows another. Could also be exploited for phishing or social engineering ("look, I'm in your company's dashboard").

**Fix:** In the tenant layout, compare `tenantSlug` to the session's tenant slug. If mismatched, redirect to the correct URL or to `/select-tenant`.

---

### M5. No Confirmation Dialogs for Destructive Actions

**Files:** `apps/web/app/(dashboard)/[tenant]/notes/page.tsx` (delete button), `apps/web/app/(dashboard)/[tenant]/settings/members/page.tsx` (remove button), `apps/web/app/(dashboard)/[tenant]/settings/roles/page.tsx` (delete button)

**What's wrong:** Notes deletion, member removal, and role deletion all happen with a single click. No confirmation dialog, no "are you sure?", no undo.

**Why it matters:** Accidental data loss. In a real business context, accidentally removing a team member or deleting a role assigned to employees is disruptive and hard to recover from.

**Fix:** Add confirmation dialogs for all destructive actions. For soft-deletes (notes), show a toast with undo. For hard-deletes (roles, memberships), require explicit confirmation.

---

### M6. Middleware Auth Check Is Cookie-Existence Only

**File:** `apps/web/middleware.ts`

**What's wrong:** The Next.js middleware checks if the `session_token` cookie exists but doesn't validate it. An expired or invalid token passes the middleware, letting the user into protected routes. All tRPC calls then fail with 401, leaving the user in a broken state.

**Why it matters:** Users with expired sessions see a blank dashboard with error messages instead of being cleanly redirected to login. Poor user experience that makes the platform feel broken.

**Fix:** Validate the session token in middleware. If invalid, clear the cookie and redirect to login. This requires a database call in middleware (Edge Runtime compatible) or a Redis-based session check.

---

### M7. `permissionSchema` Regex Rejects Hyphenated Module IDs

**File:** `packages/shared/src/validators/index.ts` (line 65)

**What's wrong:** The permission regex `/^(\*|[a-z]+:\*|[a-z]+:[a-z]+:\*|[a-z]+:[a-z]+:[a-z]+)$/` only allows lowercase letters in segment names. But module IDs can contain hyphens (the README example shows `my-module:items:read`). Any module with a hyphenated ID will fail permission validation when creating or updating roles.

**Why it matters:** The platform is supposed to support adding new modules. Any module with a hyphen in its ID (common in node-style naming) will break the role/permission system.

**Fix:** Update regex to allow hyphens: `[a-z][a-z0-9-]*` in each segment.

---

### M8. No `updatedAt` Auto-Update Mechanism

**Files:** All schema files with `updatedAt` columns

**What's wrong:** `updatedAt` columns exist on `tenants`, `users`, and `notes`, but there's no database trigger or Drizzle hook to auto-update them. Only some mutations manually set `updatedAt: new Date()`. Others will leave stale timestamps.

**Why it matters:** `updatedAt` is used for sorting (notes list) and display. Stale values mean incorrect ordering and misleading "last updated" displays.

**Fix:** Add a PostgreSQL trigger function that auto-updates `updated_at` on row modification. Or create a Drizzle middleware/hook that injects `updatedAt: new Date()` on every update.

---

### M9. Audit Log Doesn't Capture IP Consistently

**Files:** `packages/core/src/modules/notes/router.ts` (all mutations — no `ipAddress`), `packages/core/src/modules/lifecycle.ts` (module enable/disable — `ipAddress` undefined)

**What's wrong:** The `createAuditLog()` function accepts `ipAddress` but many callers don't pass it. Notes CRUD operations never include the IP. Module lifecycle operations don't have access to the IP.

**Why it matters:** Audit logs are for compliance and incident investigation. Logs without IP addresses are significantly less useful for tracing who did what and from where. BIR compliance (Philippines) may require complete audit trails.

**Fix:** Pass `ctx.ipAddress` to all `createAuditLog()` calls. Consider making IP a required field in the audit log entry interface, or automatically capturing it from the tRPC context.

---

### M10. Error Handling Missing on Multiple Mutations

**Files:** `apps/web/app/(dashboard)/[tenant]/notes/page.tsx`, `apps/web/app/(dashboard)/[tenant]/settings/members/page.tsx`, `apps/web/app/(dashboard)/[tenant]/settings/roles/page.tsx`

**What's wrong:** Most mutation hooks only handle `onSuccess` but not `onError`. Failed note deletions, member removals, and role operations silently fail. The user clicks a button, nothing happens, no error message.

**Why it matters:** Users think the action worked when it didn't. They might try again, get confused, or lose trust in the platform.

**Fix:** Add `onError` handlers with toast notifications for all mutations.

---

## 🟢 LOW — Nice to have

### L1. Typo: `hasMulipleTenants`

**File:** `packages/core/src/trpc/routers/auth.ts` (line 83)

**What's wrong:** `hasMulipleTenants` should be `hasMultipleTenants`. This is a public API response field.

**Fix:** Rename. But since it's a breaking change for any existing clients, document it.

---

### L2. Unused Import: `text` in tenants.ts

**File:** `packages/core/src/db/schema/tenants.ts` (line 1)

**What's wrong:** `text` is imported from `drizzle-orm/pg-core` but never used in the tenants table definition.

**Fix:** Remove unused import.

---

### L3. Packages Use Raw TypeScript as Entry Points

**Files:** All `package.json` files in `packages/` — `"main": "./src/index.ts"`

**What's wrong:** Package entry points reference raw `.ts` files, not compiled output. This works in development with TypeScript path resolution but will fail in production builds without transpilation.

**Why it matters:** Currently works because Next.js transpiles workspace dependencies. But if any package is consumed outside the monorepo (or by a non-Next.js tool), it will break.

**Fix:** Add build scripts to produce compiled output, or accept this as a monorepo-internal convention and document it.

---

### L4. `staleTime: 5 * 1000` Is Very Short for tRPC Queries

**File:** `apps/web/src/trpc/provider.tsx` (line 16)

**What's wrong:** 5-second stale time means queries refetch after 5 seconds on focus. For relatively static data (tenant info, roles, modules), this causes unnecessary load.

**Fix:** Increase default stale time (30s-60s) and set shorter stale times only for frequently-changing data.

---

### L5. Redis Is Configured But Completely Unused

**Files:** `.env` (`REDIS_URL`), architecture doc (mentions Redis for sessions, rate limiting, job queues)

**What's wrong:** Redis URL is in the environment but nothing in the codebase connects to Redis. Sessions are in PostgreSQL. No rate limiting exists. No background jobs exist.

**Fix:** Either implement Redis-backed features (rate limiting is the most urgent — see C7) or remove `REDIS_URL` from the config to avoid confusion.

---

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| 🔴 CRITICAL | 8 | Auth bypass, no RLS, no module enforcement, cross-tenant mutation, no rate limiting |
| 🟠 HIGH | 10 | Dead code, broken pagination, CSRF, privilege escalation, AI appeasement patterns |
| 🟡 MEDIUM | 10 | Missing docker-compose, no cleanup jobs, UX gaps, incomplete audit trail |
| 🟢 LOW | 5 | Typos, unused imports, minor config issues |

**Bottom line:** This codebase has the *shape* of a well-architected SaaS platform, but critical security and business logic features exist only in comments and documentation — not in the running code. The multi-tenancy isolation is application-level only (no RLS), the module system is cosmetic (no API enforcement), and the platform owner has no administrative control. It needs significant work before any real business should trust it with their data.
