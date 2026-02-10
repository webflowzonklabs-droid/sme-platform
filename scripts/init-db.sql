-- ============================================
-- Initialize the database with RLS support
-- This runs once when the Postgres container is first created.
--
-- ARCHITECTURE:
-- sme_user = superuser (POSTGRES_USER from docker-compose)
--   Used for: migrations, seed, admin operations
--
-- sme_app = non-superuser application role
--   Used for: runtime app queries, RESPECTS RLS policies
--   The app connects as this role so RLS actually enforces tenant isolation.
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a role for the application that respects RLS
-- (The default postgres/sme_user superuser bypasses ALL RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sme_app') THEN
    CREATE ROLE sme_app LOGIN PASSWORD 'sme_app_password';
  END IF;
END $$;

-- Grant privileges to sme_app
GRANT ALL PRIVILEGES ON DATABASE sme_platform TO sme_app;
GRANT ALL ON SCHEMA public TO sme_app;

-- Grant on existing tables (if any)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sme_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sme_app;

-- Grant on future tables created by sme_user (for migrations)
ALTER DEFAULT PRIVILEGES FOR ROLE sme_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sme_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sme_user IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sme_app;
