-- Initialize the database with RLS support
-- This runs once when the Postgres container is first created

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a role for the application that respects RLS
-- (The default postgres superuser bypasses RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sme_app') THEN
    CREATE ROLE sme_app LOGIN PASSWORD 'sme_app_password';
  END IF;
END $$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE sme_platform TO sme_app;
GRANT ALL ON SCHEMA public TO sme_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO sme_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO sme_app;
