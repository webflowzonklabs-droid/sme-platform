import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// Create the postgres.js connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Connection for queries (pooled)
const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle instance with full schema
export const db = drizzle(queryClient, { schema });

// Export schema for convenience
export { schema };

// Export types
export type Database = typeof db;

// Re-export schema types
export * from "./schema/index";
