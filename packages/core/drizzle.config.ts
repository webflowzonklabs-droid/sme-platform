import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use admin URL for schema operations (DDL requires superuser)
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
