-- ============================================
-- Migration: Login Rate Limiting + RLS Policy Updates
-- - Add login rate limiting columns to users
-- - Update RLS policies to also allow inserts/updates/deletes
-- ============================================

-- 1. Add login rate limiting columns to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_failed_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_locked_until" timestamptz;

-- 2. Update RLS policies to cover all operations (not just SELECT)
-- The original policies used USING which only covers SELECT and the
-- existing-row check for UPDATE/DELETE. We need WITH CHECK for INSERT/UPDATE.

-- Drop and recreate with full coverage
DROP POLICY IF EXISTS tenant_isolation_roles ON "roles";
CREATE POLICY tenant_isolation_roles ON "roles"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_memberships ON "tenant_memberships";
CREATE POLICY tenant_isolation_memberships ON "tenant_memberships"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_modules ON "tenant_modules";
CREATE POLICY tenant_isolation_modules ON "tenant_modules"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_audit ON "audit_logs";
CREATE POLICY tenant_isolation_audit ON "audit_logs"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_notes ON "notes";
CREATE POLICY tenant_isolation_notes ON "notes"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- 3. Ensure sme_app has current privileges on any new tables
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sme_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sme_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sme_app;
  END IF;
END $$;
