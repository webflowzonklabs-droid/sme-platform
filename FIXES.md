# Prioritized Fix Plan — SME SaaS Platform

Based on the findings in `AUDIT.md`. Ordered by impact and dependency — fix in this order.

---

## Phase 1: Security & Auth Hardening (Days 1-3)

These are pre-requisites for everything else. No point adding features if the auth is broken.

### 1.1 Add Rate Limiting on Auth Endpoints [C7]
**Effort:** 4-6 hours  
**Files to change:** `packages/core/src/trpc/routers/auth.ts`, new file `packages/core/src/auth/rate-limit.ts`

**Steps:**
1. Install `@upstash/ratelimit` and `@upstash/redis` (or use `ioredis` with the existing `REDIS_URL`)
2. Create a rate limiter module:
   - Login: 5 attempts per email per 15 minutes
   - PIN login: 3 attempts per user+tenant per 1 hour  
   - Register: 3 accounts per IP per hour
3. Add rate limit check before password/PIN verification in auth router
4. Return 429 with retry-after header on rate limit exceeded
5. Log rate limit hits to audit trail

### 1.2 Hash PIN Codes [C6]
**Effort:** 2-3 hours  
**Files to change:** `packages/core/src/trpc/routers/auth.ts`, `packages/core/src/trpc/routers/users.ts`, `packages/core/src/db/seed.ts`

**Steps:**
1. Use `hashPassword()` for PINs (same bcrypt/argon2 flow)
2. Update `pinLogin` to use `verifyPassword(input.pin, membership.pinCode)`
3. Update `invite` and `updateMembership` to hash PINs before storage
4. Write a migration script to hash existing plaintext PINs
5. Update seed script to hash the demo PINs

### 1.3 Fix Cross-Tenant Update Vulnerability [C4]
**Effort:** 30 minutes  
**Files to change:** `packages/core/src/trpc/routers/tenants.ts`

**Steps:**
1. In `tenants.update`, add: `if (input.id !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN' })`
2. Better yet: remove `id` from `updateTenantSchema` and always use `ctx.tenantId`
3. Update the frontend to not pass the tenant ID

### 1.4 Block System Role Permission Modification [C5]
**Effort:** 30 minutes  
**Files to change:** `packages/core/src/trpc/routers/roles.ts`

**Steps:**
1. In `roles.update`, add check: `if (existing.isSystem && input.permissions) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot modify system role permissions' })`
2. Consider: should admins be allowed to modify system roles at all? Probably not.

### 1.5 Add CSRF Protection [H6]
**Effort:** 1-2 hours  
**Files to change:** `apps/web/app/api/trpc/[trpc]/route.ts`

**Steps:**
1. In the tRPC handler, verify the `X-TRPC-Source` header exists (already sent by the client)
2. For mutations (POST), require the header to equal `react`
3. Add CORS configuration to prevent cross-origin requests with credentials

### 1.6 Fix Session Token Exposure [H8]
**Effort:** 3-4 hours  
**Files to change:** New file `apps/web/app/api/auth/login/route.ts`, new file `apps/web/app/api/auth/register/route.ts`, `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/register/page.tsx`

**Steps:**
1. Create Next.js API route handlers for login/register that:
   - Validate credentials server-side
   - Create session
   - Set httpOnly cookie in the same response
   - Return user info (but NOT the token)
2. Update frontend to call these API routes instead of tRPC for auth
3. Keep tRPC auth procedures for server-side use (e.g., tenant switching)

---

## Phase 2: Multi-Tenancy & Module Enforcement (Days 4-6)

### 2.1 Implement Real RLS Policies [C2]
**Effort:** 6-8 hours  
**Files to change:** New migration file, `scripts/init-db.sql`, `.env`

**Steps:**
1. Create a new Drizzle migration that:
   ```sql
   -- Enable RLS on all tenant-scoped tables
   ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
   ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
   ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
   ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
   
   -- Create policies
   CREATE POLICY tenant_isolation ON roles
     USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
   -- ... repeat for all tables
   
   -- Grant permissions to sme_app role
   GRANT USAGE ON SCHEMA public TO sme_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sme_app;
   ```
2. Update `.env` to use `sme_app` connection string for the app
3. Keep superuser connection for migrations only

### 2.2 Wire Up `withTenant()` in tRPC Context [H3, C2]
**Effort:** 3-4 hours  
**Files to change:** `packages/core/src/trpc/procedures.ts`, `packages/core/src/trpc/context.ts`

**Steps:**
1. In `hasTenantContext` middleware, wrap all downstream operations in `withTenant()`
2. Pass the transaction through context so all queries use it
3. This requires restructuring how `db` is accessed in routes — they'll need to use `ctx.db` instead of importing `db` directly
4. Test that all queries work within the transaction

### 2.3 Add Module Access Middleware [C3]
**Effort:** 2-3 hours  
**Files to change:** `packages/core/src/trpc/procedures.ts`, `packages/core/src/modules/notes/router.ts`

**Steps:**
1. Create `requireModule(moduleId)` middleware:
   ```typescript
   export function requireModule(moduleId: string) {
     return t.middleware(async ({ ctx, next }) => {
       const enabled = await isModuleEnabled(ctx.tenantId, moduleId);
       if (!enabled) {
         throw new TRPCError({ code: 'FORBIDDEN', message: `Module "${moduleId}" is not enabled` });
       }
       return next({ ctx });
     });
   }
   ```
2. Apply `requireModule("notes")` to all notes router procedures
3. Cache the enabled modules check in context (avoid N+1 queries per request)

### 2.4 Create Platform Admin Role [C1, C8]
**Effort:** 8-12 hours  
**Files to change:** Multiple new files, schema changes

**Steps:**
1. Add `isPlatformAdmin` boolean to `users` table (new migration)
2. Create `platformAdminProcedure` middleware
3. Move `modules.enable` and `modules.disable` behind `platformAdminProcedure`
4. Create basic admin API routes:
   - `admin.tenants.list` — list all tenants
   - `admin.tenants.enableModule` — enable module for a tenant
   - `admin.tenants.disableModule` — disable module for a tenant
   - `admin.tenants.deactivate` — deactivate a tenant
5. Create minimal admin UI (even a single page is enough for now)
6. Remove the module toggle UI from tenant settings
7. Update seed script to mark admin@demo.com as platform admin

---

## Phase 3: Fix Broken Functionality (Days 7-8)

### 3.1 Fix Cursor-Based Pagination [H1]
**Effort:** 3-4 hours  
**Files to change:** All router files with pagination, `packages/shared/src/utils/index.ts`, `packages/shared/src/validators/index.ts`

**Steps:**
1. Update `paginationSchema` to accept a cursor object: `{ id: string, sortValue: string }`
2. Update queries to use the sort field for cursor comparison
3. For `notes.list` (sorted by `updatedAt` desc):
   ```typescript
   .where(
     input.cursor
       ? or(
           lt(notes.updatedAt, input.cursor.sortValue),
           and(eq(notes.updatedAt, input.cursor.sortValue), gt(notes.id, input.cursor.id))
         )
       : undefined
   )
   ```
4. Update `paginatedResult` to return the correct cursor
5. Update frontend components to pass the cursor correctly

### 3.2 Fix React Anti-Patterns [H9, H10]
**Effort:** 1 hour  
**Files to change:** `apps/web/app/(dashboard)/[tenant]/settings/page.tsx`, `apps/web/app/(auth)/select-tenant/page.tsx`

**Steps:**
1. Settings page: Replace render-time state setting with `useEffect`:
   ```typescript
   useEffect(() => {
     if (tenant) setName(tenant.name);
   }, [tenant?.name]);
   ```
2. Select tenant page: Wrap auto-switch in `useEffect`:
   ```typescript
   useEffect(() => {
     if (tenants?.length === 1) {
       switchTenant.mutate({ tenantId: tenants[0].tenantId });
     }
   }, [tenants]);
   ```

### 3.3 Add Missing docker-compose.yml [M1]
**Effort:** 30 minutes  

**Steps:**
1. Create `docker-compose.yml`:
   ```yaml
   services:
     postgres:
       image: postgres:16
       environment:
         POSTGRES_DB: sme_platform
         POSTGRES_USER: sme_user
         POSTGRES_PASSWORD: sme_password
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
         - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
   volumes:
     postgres_data:
   ```

### 3.4 Fix Permission Regex [M7]
**Effort:** 15 minutes  
**Files to change:** `packages/shared/src/validators/index.ts`

**Steps:**
1. Update regex to allow hyphens and numbers: 
   ```typescript
   /^(\*|[a-z][a-z0-9-]*:\*|[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:\*|[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*)$/
   ```

---

## Phase 4: UX & Polish (Days 9-10)

### 4.1 Add Confirmation Dialogs [M5]
**Effort:** 2-3 hours  

Create a reusable `ConfirmDialog` component and add it to all destructive actions.

### 4.2 Add Error Handling to All Mutations [M10]
**Effort:** 2-3 hours  

Add `onError` handlers with toast notifications to all mutation hooks.

### 4.3 Validate Tenant Slug in Dashboard Layout [M4]
**Effort:** 1 hour  

Compare URL slug to session tenant. Redirect on mismatch.

### 4.4 Add Expired Session Cleanup [M3]
**Effort:** 1-2 hours  

Add a Next.js API cron endpoint or a scheduled job.

### 4.5 Fix Audit Log IP Capture [M9]
**Effort:** 1 hour  

Pass `ctx.ipAddress` to all `createAuditLog()` calls.

### 4.6 Escape LIKE Special Characters [M2]
**Effort:** 30 minutes  

Add utility: `function escapeLike(s: string) { return s.replace(/[%_\\]/g, '\\$&'); }`

---

## Phase 5: Clean Up Dead Code (Day 10)

### 5.1 Remove or Wire Up Dead Functions [H4]
**Effort:** 2 hours

- **Delete:** `buildRolePermissions()`, `resolveModuleDependencies()`, `getModulesInOrder()` (unless you wire them up)
- **Delete:** `SessionContext`, `ModuleDefinition`, `AppError` unused types
- **Wire up or delete:** `invalidateAllUserSessions()` (useful for "revoke all sessions" feature)
- Fix the typo: `hasMulipleTenants` → `hasMultipleTenants`

### 5.2 Auto-Update `updatedAt` [M8]
**Effort:** 1-2 hours

Add a PostgreSQL trigger function in a migration:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- ... repeat for users, notes
```

---

## Effort Summary

| Phase | Focus | Est. Days | Est. Hours |
|-------|-------|-----------|------------|
| 1 | Security & Auth | 3 | 14-20 |
| 2 | Multi-Tenancy & Modules | 3 | 19-27 |
| 3 | Broken Functionality | 2 | 6-9 |
| 4 | UX & Polish | 2 | 8-12 |
| 5 | Dead Code Cleanup | 1 | 3-4 |
| **Total** | | **~10 days** | **~50-72 hours** |

---

## What NOT to Fix Yet

- **Switching to argon2id [H7]:** bcrypt is acceptable. Prioritize other security fixes.
- **Dynamic module router registration [H5]:** Works fine with static imports for now. Fix when you have 5+ modules.
- **Redis session store [L5]:** PostgreSQL sessions work. Redis matters at scale.
- **Package build system [L3]:** Current setup works within the monorepo. Fix when publishing packages.

---

## Definition of "Fixed"

For each fix, verify with a test:
1. **C4 (cross-tenant update):** Attempt to update a different tenant's settings → expect 403
2. **C3 (module enforcement):** Disable notes module, call `notes.create` → expect 403
3. **C2 (RLS):** Execute a raw SQL query without setting tenant context → expect empty results
4. **C5 (privilege escalation):** Attempt to update owner role permissions as admin → expect 400
5. **C7 (rate limiting):** Send 10 login attempts in 1 second → expect 429 after 5th
6. **C6 (PIN hashing):** Check database → PIN column should contain bcrypt hash, not digits

If these six tests pass, the critical issues are resolved.
