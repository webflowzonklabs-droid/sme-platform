import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { hashPassword } from "../auth/password";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "@sme/shared";

async function seedAirsoft() {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("🔫 Seeding Bravo Airsoft data...\n");

  // 1. Tenant
  console.log("📦 Creating tenant...");
  let [tenant] = await db.insert(schema.tenants).values({
    name: "Bravo Airsoft",
    slug: "bravo-airsoft",
    settings: { timezone: "Asia/Manila", currency: "PHP", locale: "en-PH" },
  }).onConflictDoNothing({ target: schema.tenants.slug }).returning();

  if (!tenant) {
    [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, "bravo-airsoft")).limit(1);
    console.log("  ↳ Tenant already exists, reusing.");
  } else {
    console.log(`  ↳ Created: ${tenant.name}`);
  }

  // 2. System roles
  console.log("\n👥 Creating roles...");
  const roleMap = new Map<string, string>();
  for (const roleSlug of SYSTEM_ROLES) {
    const [role] = await db.insert(schema.roles).values({
      tenantId: tenant.id,
      name: roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1),
      slug: roleSlug,
      description: `System ${roleSlug} role`,
      permissions: SYSTEM_ROLE_PERMISSIONS[roleSlug],
      isSystem: true,
    }).onConflictDoNothing().returning();
    if (role) {
      roleMap.set(roleSlug, role.id);
      console.log(`  ↳ ${role.name} (${role.permissions.length} perms)`);
    } else {
      // fetch existing
      const [existing] = await db.select().from(schema.roles)
        .where(eq(schema.roles.tenantId, tenant.id))
        .limit(100);
      // re-query specific
      const rows = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
      for (const r of rows) roleMap.set(r.slug, r.id);
      break;
    }
  }

  // 3. Admin user
  console.log("\n👤 Creating admin user...");
  const passwordHash = await hashPassword("BravoAdmin123!");
  let [adminUser] = await db.insert(schema.users).values({
    email: "admin@bravoairsoft.com",
    passwordHash,
    fullName: "Bravo Admin",
    emailVerified: true,
  }).onConflictDoNothing({ target: schema.users.email }).returning();

  if (!adminUser) {
    [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, "admin@bravoairsoft.com")).limit(1);
    console.log("  ↳ User already exists, reusing.");
  } else {
    console.log(`  ↳ Created: ${adminUser.email}`);
  }

  // Assign as owner
  const ownerRoleId = roleMap.get("owner");
  if (ownerRoleId) {
    const pinHash = await hashPassword("1234");
    await db.insert(schema.tenantMemberships).values({
      tenantId: tenant.id,
      userId: adminUser.id,
      roleId: ownerRoleId,
      pinHash,
      pinCode: null,
    }).onConflictDoNothing();
    console.log("  ↳ Assigned as owner (PIN hashed)");
  }

  // 4. Enable modules
  console.log("\n📦 Enabling modules...");
  // Register catalog system module if not exists
  await db.insert(schema.systemModules).values({
    id: "catalog",
    name: "Catalog",
    description: "Product catalog module",
    version: "1.0.0",
    dependencies: [],
  }).onConflictDoNothing();

  for (const modId of ["catalog", "notes"]) {
    await db.insert(schema.tenantModules).values({
      tenantId: tenant.id,
      moduleId: modId,
    }).onConflictDoNothing();
    console.log(`  ↳ Enabled: ${modId}`);
  }

  // 5. Categories
  console.log("\n📂 Creating categories...");
  const categoryData = [
    { name: "Rifles", slug: "rifles" },
    { name: "Pistols", slug: "pistols" },
    { name: "Gear & Accessories", slug: "gear-accessories" },
    { name: "Tactical Equipment", slug: "tactical-equipment" },
    { name: "BBs & Consumables", slug: "bbs-consumables" },
    { name: "Parts & Upgrades", slug: "parts-upgrades" },
  ];

  const catMap = new Map<string, string>();
  for (let i = 0; i < categoryData.length; i++) {
    const c = categoryData[i];
    const [cat] = await db.insert(schema.catalogCategories).values({
      tenantId: tenant.id,
      name: c.name,
      slug: c.slug,
      sortOrder: i,
    }).onConflictDoNothing().returning();
    if (cat) {
      catMap.set(c.slug, cat.id);
      console.log(`  ↳ ${cat.name}`);
    } else {
      const [existing] = await db.select().from(schema.catalogCategories)
        .where(eq(schema.catalogCategories.tenantId, tenant.id))
        .limit(100);
      const rows = await db.select().from(schema.catalogCategories).where(eq(schema.catalogCategories.tenantId, tenant.id));
      for (const r of rows) catMap.set(r.slug, r.id);
      break;
    }
  }

  // 6. Subcategories
  console.log("\n📁 Creating subcategories...");
  const subcatData: Record<string, { name: string; slug: string }[]> = {
    "rifles": [
      { name: "AEG", slug: "aeg" },
      { name: "GBB Rifle", slug: "gbb-rifle" },
      { name: "Sniper", slug: "sniper" },
      { name: "DMR", slug: "dmr" },
      { name: "Shotgun", slug: "shotgun" },
    ],
    "pistols": [
      { name: "Gas Blowback", slug: "gas-blowback" },
      { name: "Electric", slug: "electric" },
      { name: "Spring", slug: "spring" },
      { name: "CO2", slug: "co2" },
    ],
    "gear-accessories": [
      { name: "Optics", slug: "optics" },
      { name: "Grips & Rails", slug: "grips-rails" },
      { name: "Magazines", slug: "magazines" },
      { name: "Slings", slug: "slings" },
      { name: "Flashlights", slug: "flashlights" },
    ],
    "tactical-equipment": [
      { name: "Plate Carriers", slug: "plate-carriers" },
      { name: "Helmets", slug: "helmets" },
      { name: "Gloves", slug: "gloves" },
      { name: "Goggles", slug: "goggles" },
      { name: "BDUs", slug: "bdus" },
    ],
    "bbs-consumables": [
      { name: "BBs", slug: "bbs" },
      { name: "Green Gas", slug: "green-gas" },
      { name: "CO2 Cartridges", slug: "co2-cartridges" },
      { name: "Batteries", slug: "batteries" },
      { name: "Chargers", slug: "chargers" },
    ],
    "parts-upgrades": [
      { name: "Hop-up Units", slug: "hop-up-units" },
      { name: "Inner Barrels", slug: "inner-barrels" },
      { name: "Gearbox Parts", slug: "gearbox-parts" },
      { name: "Motors", slug: "motors" },
      { name: "External Parts", slug: "external-parts" },
    ],
  };

  const subMap = new Map<string, string>(); // slug -> id
  for (const [catSlug, subs] of Object.entries(subcatData)) {
    const categoryId = catMap.get(catSlug);
    if (!categoryId) { console.log(`  ⚠️ Category ${catSlug} not found`); continue; }
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      const [sub] = await db.insert(schema.catalogSubcategories).values({
        tenantId: tenant.id,
        categoryId,
        name: s.name,
        slug: s.slug,
        sortOrder: i,
      }).onConflictDoNothing().returning();
      if (sub) {
        subMap.set(s.slug, sub.id);
        console.log(`  ↳ ${catSlug} > ${sub.name}`);
      }
    }
  }
  // If subcats already existed, fetch them
  if (subMap.size === 0) {
    const rows = await db.select().from(schema.catalogSubcategories).where(eq(schema.catalogSubcategories.tenantId, tenant.id));
    for (const r of rows) subMap.set(r.slug, r.id);
  }

  // 7. Attribute Definitions
  console.log("\n🏷️ Creating attribute definitions...");
  const attrData = [
    { name: "FPS Range", slug: "fps-range", type: "text", options: null },
    { name: "Power Source", slug: "power-source", type: "select", options: ["AEG", "Gas", "Spring", "HPA", "CO2"] },
    { name: "Material", slug: "material", type: "select", options: ["Polymer", "Full Metal", "Wood/Metal", "Carbon Fiber"] },
    { name: "Weight", slug: "weight", type: "text", options: null },
    { name: "Magazine Capacity", slug: "magazine-capacity", type: "number", options: null },
    { name: "Color", slug: "color", type: "select", options: ["Black", "Tan/FDE", "OD Green", "Multicam", "Two-Tone"] },
  ];

  const attrMap = new Map<string, string>(); // slug -> id
  for (let i = 0; i < attrData.length; i++) {
    const a = attrData[i];
    const [attr] = await db.insert(schema.catalogAttributeDefinitions).values({
      tenantId: tenant.id,
      name: a.name,
      slug: a.slug,
      type: a.type,
      options: a.options,
      sortOrder: i,
    }).onConflictDoNothing().returning();
    if (attr) {
      attrMap.set(a.slug, attr.id);
      console.log(`  ↳ ${attr.name} (${attr.type})`);
    }
  }
  if (attrMap.size === 0) {
    const rows = await db.select().from(schema.catalogAttributeDefinitions).where(eq(schema.catalogAttributeDefinitions.tenantId, tenant.id));
    for (const r of rows) attrMap.set(r.slug, r.id);
  }

  // 8. Products
  console.log("\n📦 Creating products...");

  function photoUrl(name: string) {
    return `https://placehold.co/600x400/1a1f16/e8e6e0?text=${encodeURIComponent(name)}`;
  }

  interface ProductDef {
    name: string; slug: string; brand: string; catSlug: string; subSlug: string;
    price: string; featured: boolean; isNew: boolean; stock: string;
    attrs: Record<string, string>;
  }

  const products: ProductDef[] = [
    { name: "Tokyo Marui MK18 Mod 1 NGRS", slug: "tokyo-marui-mk18-mod1-ngrs", brand: "Tokyo Marui", catSlug: "rifles", subSlug: "aeg", price: "32500.00", featured: true, isNew: true, stock: "in_stock", attrs: { "fps-range": "280-290", "power-source": "AEG", "material": "Full Metal", "magazine-capacity": "82" } },
    { name: "KWA Ronin T6 AEG 2.5+", slug: "kwa-ronin-t6-aeg", brand: "KWA", catSlug: "rifles", subSlug: "aeg", price: "18900.00", featured: false, isNew: true, stock: "in_stock", attrs: { "fps-range": "350-370", "power-source": "AEG", "material": "Full Metal", "magazine-capacity": "120" } },
    { name: "VFC Avalon Saber CQB", slug: "vfc-avalon-saber-cqb", brand: "VFC", catSlug: "rifles", subSlug: "aeg", price: "21500.00", featured: false, isNew: false, stock: "in_stock", attrs: { "fps-range": "340-360", "power-source": "AEG", "material": "Full Metal", "magazine-capacity": "120" } },
    { name: "Novritsch SSG10 A3", slug: "novritsch-ssg10-a3", brand: "Novritsch", catSlug: "rifles", subSlug: "sniper", price: "24000.00", featured: false, isNew: false, stock: "in_stock", attrs: { "fps-range": "430-500", "power-source": "Spring", "material": "Full Metal", "magazine-capacity": "25" } },
    { name: "G&G CM16 Raider 2.0", slug: "gg-cm16-raider-20", brand: "G&G", catSlug: "rifles", subSlug: "aeg", price: "8500.00", featured: false, isNew: false, stock: "out_of_stock", attrs: { "fps-range": "320-340", "power-source": "AEG", "material": "Polymer", "magazine-capacity": "300" } },
    { name: "Tokyo Marui Hi-CAPA 5.1 Gold Match", slug: "tokyo-marui-hicapa-51-gold-match", brand: "Tokyo Marui", catSlug: "pistols", subSlug: "gas-blowback", price: "12800.00", featured: true, isNew: false, stock: "in_stock", attrs: { "fps-range": "280-300", "power-source": "Gas", "material": "Full Metal", "magazine-capacity": "31" } },
    { name: "Elite Force Glock 17 Gen5", slug: "elite-force-glock-17-gen5", brand: "Elite Force", catSlug: "pistols", subSlug: "gas-blowback", price: "9500.00", featured: false, isNew: true, stock: "in_stock", attrs: { "fps-range": "290-310", "power-source": "Gas", "material": "Polymer", "magazine-capacity": "23" } },
    { name: "ASG CZ P-09 Duty", slug: "asg-cz-p09-duty", brand: "ASG", catSlug: "pistols", subSlug: "co2", price: "7200.00", featured: false, isNew: false, stock: "out_of_stock", attrs: { "fps-range": "370-390", "power-source": "CO2", "material": "Polymer", "magazine-capacity": "25" } },
    { name: "Crye Precision JPC 2.0 (Replica)", slug: "crye-precision-jpc-20-replica", brand: "Crye Precision", catSlug: "tactical-equipment", subSlug: "plate-carriers", price: "4500.00", featured: true, isNew: false, stock: "in_stock", attrs: { "color": "Black" } },
    { name: "FMA Ops-Core FAST Helmet", slug: "fma-ops-core-fast-helmet", brand: "FMA", catSlug: "tactical-equipment", subSlug: "helmets", price: "3200.00", featured: false, isNew: false, stock: "in_stock", attrs: { "color": "OD Green" } },
    { name: "Mechanix M-Pact Tactical Gloves", slug: "mechanix-mpact-tactical-gloves", brand: "Mechanix", catSlug: "tactical-equipment", subSlug: "gloves", price: "1800.00", featured: false, isNew: false, stock: "in_stock", attrs: { "color": "Tan/FDE" } },
    { name: "BLS Perfect BBs 0.25g 4000rd", slug: "bls-perfect-bbs-025g-4000rd", brand: "BLS", catSlug: "bbs-consumables", subSlug: "bbs", price: "650.00", featured: false, isNew: false, stock: "in_stock", attrs: { "color": "Black" } },
    { name: "Titan 11.1v 3000mAh Li-Ion Battery", slug: "titan-111v-3000mah-lion-battery", brand: "Titan", catSlug: "bbs-consumables", subSlug: "batteries", price: "3800.00", featured: false, isNew: false, stock: "in_stock", attrs: {} },
    { name: "Prometheus 6.03mm EG Inner Barrel", slug: "prometheus-603mm-eg-inner-barrel", brand: "Prometheus", catSlug: "parts-upgrades", subSlug: "inner-barrels", price: "2900.00", featured: false, isNew: false, stock: "in_stock", attrs: {} },
    { name: "ASG Infinity CNC Motor 40K", slug: "asg-infinity-cnc-motor-40k", brand: "ASG", catSlug: "parts-upgrades", subSlug: "motors", price: "3500.00", featured: false, isNew: false, stock: "in_stock", attrs: {} },
  ];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const categoryId = catMap.get(p.catSlug);
    if (!categoryId) { console.log(`  ⚠️ Category ${p.catSlug} not found`); continue; }

    const [product] = await db.insert(schema.catalogProducts).values({
      tenantId: tenant.id,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      price: p.price,
      categoryId,
      stockStatus: p.stock,
      isFeatured: p.featured,
      isNew: p.isNew,
      sortOrder: i,
    }).onConflictDoNothing().returning();

    if (!product) { console.log(`  ↳ ${p.name} (skipped, exists)`); continue; }
    console.log(`  ↳ ${product.name} — ₱${p.price}`);

    // Photo
    await db.insert(schema.catalogProductPhotos).values({
      tenantId: tenant.id,
      productId: product.id,
      url: photoUrl(p.name),
      altText: p.name,
      isPrimary: true,
    }).onConflictDoNothing();

    // Subcategory link
    const subId = subMap.get(p.subSlug);
    if (subId) {
      await db.insert(schema.catalogProductSubcategories).values({
        productId: product.id,
        subcategoryId: subId,
      }).onConflictDoNothing();
    }

    // Attributes
    for (const [attrSlug, value] of Object.entries(p.attrs)) {
      const attrDefId = attrMap.get(attrSlug);
      if (attrDefId) {
        await db.insert(schema.catalogProductAttributes).values({
          productId: product.id,
          attributeDefinitionId: attrDefId,
          value,
        }).onConflictDoNothing();
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Bravo Airsoft seed complete!");
  console.log(`\nTenant: Bravo Airsoft (bravo-airsoft)`);
  console.log(`Login: admin@bravoairsoft.com / BravoAdmin123!`);
  console.log(`PIN: 1234 (hashed)`);
  console.log(`Products: 15 | Categories: 6 | Subcategories: 30`);
  console.log("=".repeat(50));

  await client.end();
  process.exit(0);
}

seedAirsoft().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
