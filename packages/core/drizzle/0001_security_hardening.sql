-- ============================================
-- Migration: Security Hardening
-- - Add isSuperAdmin to users
-- - Add PIN hash + rate limiting columns
-- - Enable RLS on all tenant-scoped tables
-- - Create RLS policies
-- - Add updated_at trigger function
-- ============================================

-- 1. Add super admin flag to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false NOT NULL;

-- 2. Add PIN hash and rate limiting columns to tenant_memberships
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "pin_hash" text;
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "pin_failed_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "pin_locked_until" timestamptz;

-- 3. Enable RLS on all tenant-scoped tables
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for tenant isolation
-- Policy: rows are only visible when tenant_id matches the session's app.current_tenant_id

CREATE POLICY tenant_isolation_roles ON "roles"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_memberships ON "tenant_memberships"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_modules ON "tenant_modules"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_audit ON "audit_logs"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_notes ON "notes"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- 5. Grant permissions to sme_app role (non-superuser for RLS compliance)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sme_app') THEN
    GRANT USAGE ON SCHEMA public TO sme_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sme_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sme_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sme_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sme_app;
  END IF;
END $$;

-- 6. Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_notes_updated_at BEFORE UPDATE ON "notes"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
