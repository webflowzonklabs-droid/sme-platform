# SME Platform — Layer 1

All-in-one business management platform for Philippine SMEs. This is **Layer 1** — the foundational core that all business modules (inventory, HR, payroll, POS) build on top of.

## What's Included

### Core Platform
- 🏢 **Multi-Tenancy** — Shared DB with RLS-ready design, path-based routing (`/[tenant-slug]/...`)
- 🔐 **Authentication** — Email/password login (bcrypt), PIN-based quick auth, database sessions with httpOnly cookies
- 🛡️ **RBAC** — Permission format `module:resource:action`, 5 built-in system roles, custom roles, wildcard support (`inventory:*`, `*`)
- 📦 **Module System** — `defineModule()` for self-registration, enable/disable per tenant, dependency resolution, dynamic navigation
- 📝 **Audit Trail** — Append-only audit logs for all mutations
- ⚡ **tRPC API** — End-to-end type safety, auth/tenant/permission middleware

### Frontend
- 🎨 **Dashboard** — Responsive sidebar layout with mobile support
- 🔑 **Auth Pages** — Login, register, tenant selector, tenant creation
- ⚙️ **Settings** — Tenant settings, member management, role management, module management
- 📝 **Notes Module** — Example CRUD module proving the module system works
- 💅 **shadcn/ui** — Tailwind CSS components (button, input, card, dialog, table, select, etc.)

### Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) + TypeScript (strict) |
| Database | PostgreSQL 16 + Drizzle ORM |
| API | tRPC v11 |
| Auth | bcryptjs + database sessions |
| UI | Tailwind CSS + shadcn/ui |
| Validation | Zod |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
sme-platform/
├── apps/
│   └── web/                    # Next.js 15 application
│       ├── app/
│       │   ├── (auth)/         # Login, register, tenant selector
│       │   ├── (dashboard)/    # Authenticated dashboard
│       │   │   └── [tenant]/   # Tenant-scoped routes
│       │   │       ├── notes/  # Example module pages
│       │   │       └── settings/
│       │   └── api/            # tRPC API handler
│       └── src/
│           ├── components/     # React components
│           ├── lib/            # Auth helpers
│           └── trpc/           # tRPC client setup
├── packages/
│   ├── core/                   # Core library
│   │   ├── src/
│   │   │   ├── auth/           # Password hashing, sessions
│   │   │   ├── audit/          # Audit logging
│   │   │   ├── db/             # Drizzle schema, migrations, seed
│   │   │   ├── modules/        # Module registry + lifecycle
│   │   │   │   └── notes/      # Example notes module
│   │   │   ├── rbac/           # Permission checking
│   │   │   ├── tenant/         # Multi-tenant helpers
│   │   │   └── trpc/           # tRPC setup + all routers
│   │   └── drizzle/            # Generated migrations
│   ├── shared/                 # Types, validators (Zod), utilities
│   └── ui/                     # shadcn/ui components
├── tooling/
│   ├── tailwind/               # Shared Tailwind config
│   └── typescript/             # Shared TSConfig
├── docker-compose.yml          # Local Postgres + Redis
└── scripts/
    └── init-db.sql             # DB initialization
```

## Quick Start

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 10
- PostgreSQL 16 (via Docker or local install)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/louiselmps/sme-platform.git
cd sme-platform
pnpm install

# 2. Start PostgreSQL (Docker)
docker compose up -d

# 3. Copy environment variables
cp .env.example .env

# 4. Run migrations
DATABASE_URL="postgresql://sme_user:sme_password@localhost:5432/sme_platform" \
  pnpm db:migrate

# 5. Seed the database
DATABASE_URL="postgresql://sme_user:sme_password@localhost:5432/sme_platform" \
  pnpm db:seed

# 6. Start the dev server
DATABASE_URL="postgresql://sme_user:sme_password@localhost:5432/sme_platform" \
  pnpm dev
```

### Demo Credentials

| User | Email | Password | PIN | Role |
|------|-------|----------|-----|------|
| Admin | admin@demo.com | admin123456 | 1234 | Owner |
| Operator | operator@demo.com | operator123 | 5678 | Operator |

**Tenant:** Demo Company (slug: `demo`)

Visit [http://localhost:3000](http://localhost:3000) → Login → Dashboard

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant organizations (name, slug, settings JSONB) |
| `users` | Global user accounts (email, password_hash, full_name) |
| `tenant_memberships` | User↔Tenant mapping with role and optional PIN |
| `roles` | Per-tenant roles with TEXT[] permissions array |
| `sessions` | Database sessions (token_hash, auth_method, expires_at) |
| `system_modules` | Module registry |
| `tenant_modules` | Which modules enabled per tenant |
| `audit_logs` | Append-only audit trail |
| `notes` | Example module table |

### Permission Format

```
module:resource:action

Examples:
  core:users:read
  core:settings:manage
  notes:notes:write
  inventory:items:read
  *                      # superadmin wildcard
  inventory:*            # all inventory permissions
  notes:notes:*          # all actions on notes
```

### Built-in System Roles

| Role | Permissions |
|------|-------------|
| Owner | `*` (full access) |
| Admin | `core:*`, `settings:*` |
| Manager | `core:users:read`, `core:dashboard:read` |
| Operator | `core:dashboard:read` |
| Viewer | `core:dashboard:read` |

## Module System

### Defining a Module

```typescript
import { defineModule } from "@sme/core/modules";

export const myModule = defineModule({
  id: "my-module",
  name: "My Module",
  version: "1.0.0",
  dependencies: [],  // other module IDs
  
  permissions: [
    "my-module:items:read",
    "my-module:items:write",
  ],
  
  roleDefaults: {
    owner: ["my-module:*"],
    admin: ["my-module:*"],
    operator: ["my-module:items:read"],
  },
  
  navigation: [
    {
      label: "My Module",
      icon: "Package",
      href: "/my-module",
      permission: "my-module:items:read",
    },
  ],
});
```

### Module Lifecycle

- **Enable**: `enableModule(tenantId, "my-module")` — adds to `tenant_modules`, seeds role permissions
- **Disable**: `disableModule(tenantId, "my-module")` — removes from `tenant_modules`, data preserved
- **Dependencies**: Checked on enable (requires deps) and disable (blocks if dependents exist)

## API Endpoints

All API calls go through tRPC at `/api/trpc/[procedure]`.

### Auth
- `auth.register` — Create account
- `auth.login` — Email/password login
- `auth.pinLogin` — PIN-based login
- `auth.logout` — Invalidate session
- `auth.me` — Get current session
- `auth.myTenants` — List user's tenants
- `auth.switchTenant` — Switch tenant context

### Tenants
- `tenants.create` — Create organization
- `tenants.current` — Get current tenant
- `tenants.update` — Update settings

### Users
- `users.list` — List members
- `users.invite` — Invite member
- `users.updateMembership` — Change role/PIN
- `users.removeMember` — Remove member

### Roles
- `roles.list` / `roles.get` — Read roles
- `roles.create` / `roles.update` / `roles.delete` — Manage custom roles

### Modules
- `modules.available` — List all registered modules
- `modules.enabled` — List enabled for tenant
- `modules.enable` / `modules.disable` — Toggle modules

### Notes (Example)
- `notes.list` / `notes.get` — Read notes
- `notes.create` / `notes.update` / `notes.delete` — CRUD

## License

Private — All rights reserved.
