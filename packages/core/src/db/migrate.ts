import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// ============================================
// Migration Runner
//
// Uses DATABASE_ADMIN_URL (superuser) because migrations need to:
// 1. CREATE/ALTER tables (DDL operations)
// 2. CREATE/ALTER RLS policies
// 3. GRANT privileges
// These require superuser or table owner permissions.
// ============================================

async function runMigrations() {
  // Use admin connection for migrations (superuser for DDL)
  const connectionString =
    process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL or DATABASE_URL environment variable is required");
  }

  console.log("🔄 Running migrations...");

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("✅ Migrations complete");
  await migrationClient.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
