import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { hashPassword } from "../auth/password";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "@sme/shared";

// ============================================
// Seed Script — creates a usable dev environment
// ============================================

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...\n");

  // 1. Create default tenant
  console.log("📦 Creating default tenant...");
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: "Demo Company",
      slug: "demo",
      settings: {
        timezone: "Asia/Manila",
        currency: "PHP",
        locale: "en-PH",
        dateFormat: "MMM dd, yyyy",
      },
    })
    .onConflictDoNothing({ target: schema.tenants.slug })
    .returning();

  if (!tenant) {
    const [existing] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, "demo"))
      .limit(1);

    if (existing) {
      console.log("  ↳ Tenant 'demo' already exists, skipping seed.");
      await client.end();
      return;
    }
    throw new Error("Failed to create tenant");
  }

  console.log(`  ↳ Created tenant: ${tenant.name} (${tenant.slug})`);

  // 2. Create system roles
  console.log("\n👥 Creating system roles...");
  const roleMap = new Map<string, string>();

  for (const roleSlug of SYSTEM_ROLES) {
    const [role] = await db
      .insert(schema.roles)
      .values({
        tenantId: tenant.id,
        name: roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1),
        slug: roleSlug,
        description: `System ${roleSlug} role`,
        permissions: SYSTEM_ROLE_PERMISSIONS[roleSlug],
        isSystem: true,
      })
      .returning();

    if (role) {
      roleMap.set(roleSlug, role.id);
      console.log(`  ↳ Created role: ${role.name} (${role.permissions.length} permissions)`);
    }
  }

  // 3. Create admin user
  console.log("\n👤 Creating admin user...");
  const adminPassword = "admin123456";
  const passwordHash = await hashPassword(adminPassword);

  const [adminUser] = await db
    .insert(schema.users)
    .values({
      email: "admin@demo.com",
      passwordHash,
      fullName: "Admin User",
      emailVerified: true,
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  if (!adminUser) {
    throw new Error("Failed to create admin user");
  }

  console.log(`  ↳ Created user: ${adminUser.email}`);

  // 4. Assign admin user as tenant owner
  const ownerRoleId = roleMap.get("owner");
  if (!ownerRoleId) throw new Error("Owner role not found");

  await db.insert(schema.tenantMemberships).values({
    tenantId: tenant.id,
    userId: adminUser.id,
    roleId: ownerRoleId,
    pinCode: "1234",
  });

  console.log("  ↳ Assigned as tenant owner");

  // 5. Create a second test user (operator)
  console.log("\n👤 Creating test operator...");
  const operatorHash = await hashPassword("operator123");

  const [operatorUser] = await db
    .insert(schema.users)
    .values({
      email: "operator@demo.com",
      passwordHash: operatorHash,
      fullName: "Test Operator",
      emailVerified: true,
    })
    .returning();

  if (operatorUser) {
    const operatorRoleId = roleMap.get("operator");
    if (operatorRoleId) {
      await db.insert(schema.tenantMemberships).values({
        tenantId: tenant.id,
        userId: operatorUser.id,
        roleId: operatorRoleId,
        pinCode: "5678",
      });
      console.log(`  ↳ Created user: ${operatorUser.email} (operator role)`);
    }
  }

  // 6. Register the "notes" example module
  console.log("\n📦 Registering example module...");
  await db
    .insert(schema.systemModules)
    .values({
      id: "notes",
      name: "Notes",
      description: "Simple notes module — example/demo module",
      version: "1.0.0",
      dependencies: [],
    })
    .onConflictDoNothing();

  // Enable for demo tenant
  await db
    .insert(schema.tenantModules)
    .values({
      tenantId: tenant.id,
      moduleId: "notes",
    })
    .onConflictDoNothing();

  console.log("  ↳ Registered and enabled 'notes' module for demo tenant");

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Seed complete!\n");
  console.log("Login credentials:");
  console.log(`  Admin:    admin@demo.com / ${adminPassword}`);
  console.log(`  Operator: operator@demo.com / operator123`);
  console.log(`  PIN:      admin=1234, operator=5678`);
  console.log(`\nTenant:     Demo Company (slug: demo)`);
  console.log("=".repeat(50));

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
