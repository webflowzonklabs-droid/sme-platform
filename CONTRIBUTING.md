# Contributing to SME SaaS Platform

## Development Pipeline

```
Build → Audit → Fix → Test → Commit
```

### Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Run migrations
pnpm db:migrate

# 4. Seed development data
pnpm db:seed

# 5. Start dev server
pnpm dev
```

### Login Credentials (dev)

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@demo.com | admin123456 | Super Admin + Owner |
| Operator | operator@demo.com | operator123 | Operator |
| PIN Login | admin=1234, operator=5678 | | |

---

## Security Checklist for Every PR

### Multi-Tenancy Rules

- [ ] **NEVER trust user-supplied tenant IDs** — always use `ctx.tenantId` from the session
- [ ] All tenant-scoped queries include `WHERE tenant_id = ctx.tenantId`
- [ ] No endpoint accepts a `tenantId` parameter for its own tenant operations
- [ ] Cross-tenant access is only available to super admins via `superAdminProcedure`

### Authentication & Authorization

- [ ] Sensitive operations use the correct procedure level:
  - `publicProcedure` — only for login/register
  - `protectedProcedure` — logged in, no tenant context needed
  - `tenantProcedure` — logged in + tenant selected
  - `adminProcedure` — tenant admin/owner
  - `superAdminProcedure` — platform admin only
- [ ] Passwords and PINs are hashed (never stored or logged in plaintext)
- [ ] No new rate-limitable endpoints without rate limiting
- [ ] Session tokens use `crypto.randomBytes(32)`, not UUIDs
- [ ] Owner role cannot be assigned/removed except by owners or super admins

### Module Development Rules

- [ ] All module routes use `requireModule("module-id")` middleware
- [ ] Module enable/disable is a super admin operation only
- [ ] New modules are registered via `defineModule()` in the module registry
- [ ] Module routers are automatically picked up from the registry (no manual imports in app router)
- [ ] Module permissions follow the `module:resource:action` pattern

### Data Safety

- [ ] Delete operations use soft delete (`deleted_at` + `deleted_by`) where appropriate
- [ ] All queries filter out soft-deleted rows (`isNull(table.deletedAt)`)
- [ ] LIKE queries escape special characters (`%`, `_`, `\`) in user input
- [ ] Audit logs include `ctx.ipAddress`

### Row-Level Security (RLS)

- [ ] New tenant-scoped tables have RLS policies in a migration
- [ ] Application connects as `sme_app` role (non-superuser) to respect RLS
- [ ] `withTenant()` context is set in the middleware before database queries

---

## Architecture Decisions

### Platform Owner vs Tenant Admin

The platform has two distinct admin levels:

1. **Super Admin** (`users.is_super_admin = true`) — the SaaS operator who:
   - Creates and deactivates tenants
   - Enables/disables modules per tenant (monetization control)
   - Views platform-wide stats at `/admin`

2. **Tenant Admin** (role: `owner` or `admin`) — the business operator who:
   - Manages users within their tenant
   - Configures tenant settings
   - Cannot control which modules are available

### Module System

Modules are self-contained feature packages. Each module:

1. Registers itself via `defineModule()` (called at import time)
2. Defines its tRPC router, permissions, and navigation items
3. Uses `requireModule()` middleware on all routes
4. Has role-default permissions for each system role

### CSRF Protection

All tRPC mutations require the `x-trpc-source: react` header. The client already sends this header. Server-side verification prevents cross-site request forgery since browsers won't send custom headers in cross-origin requests without CORS preflight.

---

## File Structure

```
sme-platform/
├── apps/
│   └── web/              # Next.js frontend
│       ├── app/
│       │   ├── (admin)/  # Super admin pages
│       │   ├── (auth)/   # Login, register, tenant selection
│       │   └── (dashboard)/  # Tenant dashboard
│       └── src/
├── packages/
│   ├── core/             # Backend logic, DB, tRPC routers
│   │   ├── drizzle/      # SQL migrations
│   │   └── src/
│   │       ├── auth/     # Password hashing, sessions
│   │       ├── db/       # Schema, seed, migrations
│   │       ├── modules/  # Module system + module implementations
│   │       ├── rbac/     # Permission checking
│   │       ├── tenant/   # Multi-tenant helpers (withTenant)
│   │       └── trpc/     # tRPC procedures, middleware, routers
│   ├── shared/           # Types, validators, utilities
│   └── ui/               # Shared UI components
└── scripts/              # Database init scripts
```
