import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import { hashPassword } from "../auth/password";
import { SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from "@sme/shared";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ---- Config ----
const NEKNEKS_DIR = "/Users/jake-clawd/clawd/nekneks/GUNS";
const SUPABASE_URL = "https://jnavvjoddalfxttynsyd.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STORAGE_BUCKET = "nekneks-products";

// ---- Filename Parser ----
interface ParsedProduct {
  rawName: string;
  name: string;
  variant: string | null;
  price: number;
  brand: string;
  category: string;
  subcategory: string;
  stockStatus: "in_stock" | "out_of_stock";
  filePath: string;
}

const VARIANT_MAP: Record<string, string> = {
  BK: "Black", DE: "Desert", GY: "Grey", SV: "Silver", GD: "Gold",
  OD: "OD Green", RD: "Red", BL: "Blue", WH: "White", TN: "Tan",
  BR: "Brown", OR: "Orange", PR: "Purple", NP: "Nickel Plated",
  AB: "Aged Brown", RG: "Rose Gold", FR: "Frame", POW: "POW",
  BKRD: "Black/Red", BRBK: "Brown/Black", BRWH: "Brown/White",
  BS: "Black/Silver", MC: "Multicam",
};

function parseFilename(filename: string, folderPath: string): ParsedProduct | null {
  // Remove .jpg extension
  let base = filename.replace(/\.jpg$/i, "").trim();

  // Extract price: -PNNNNN or -NNNN at end
  const priceMatch = base.match(/[-\s]*P?(\d{3,6})\s*$/);
  if (!priceMatch) return null;
  const price = parseInt(priceMatch[1]);
  base = base.substring(0, base.length - priceMatch[0].length).trim();

  // Extract variant in parentheses at end, e.g. (BK), (DE)
  let variant: string | null = null;
  const variantMatch = base.match(/\(([A-Z0-9/]+)\)\s*$/);
  if (variantMatch) {
    const code = variantMatch[1];
    variant = VARIANT_MAP[code] || code;
    base = base.substring(0, base.length - variantMatch[0].length).trim();
  }

  // Also check for variant codes embedded in the name like EC-645-1BK
  if (!variant) {
    const embeddedVariant = base.match(/(BK|DE|GY|SV|GD|OD|RD|MC|WB|DY)\s*$/);
    if (embeddedVariant) {
      variant = VARIANT_MAP[embeddedVariant[1]] || embeddedVariant[1];
    }
  }

  // Clean name: remove leading/trailing parens if the whole name is in parens
  let name = base.replace(/^\(/, "").replace(/\)$/, "").trim();
  // Remove version suffixes like V2, V3 from name but keep for display
  name = name.replace(/\s*V\d+\s*$/, "").trim();

  // Determine category/subcategory from folder path
  const relPath = path.relative(NEKNEKS_DIR, folderPath);
  const parts = relPath.split(path.sep).filter(p => p && !p.includes("OUT OF STOCK"));

  const category = "GUNS";
  let subcategory = parts[0] || "UNKNOWN";
  let brand = "";

  // Detect brand from subfolder (KJW, WE, VORSK, SRC, NOVRITSCH, GOLDEN EAGLE)
  if (parts.length > 1) {
    brand = parts[parts.length - 1]; // Last non-OOS folder is brand
  }

  // If no brand from folder, try first word of product name
  if (!brand) {
    // For E&C AEG RIFLES, the brand is E&C
    if (subcategory.startsWith("E&C")) {
      brand = "E&C";
    } else {
      // First word or known brand prefix
      const firstWord = name.split(/[\s-]/)[0];
      brand = firstWord;
    }
  }

  // Stock status from folder path
  const stockStatus = folderPath.includes("OUT OF STOCK") || folderPath.includes("1OUT OF STOCK")
    ? "out_of_stock" as const
    : "in_stock" as const;

  return {
    rawName: filename,
    name,
    variant,
    price,
    brand,
    category,
    subcategory,
    stockStatus,
    filePath: path.join(folderPath, filename),
  };
}

function scanDirectory(dir: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jpg")) {
        const parsed = parseFilename(entry.name, currentDir);
        if (parsed) {
          products.push(parsed);
        } else {
          console.warn(`  ⚠️ Could not parse: ${entry.name}`);
        }
      }
    }
  }

  walk(dir);
  return products;
}

// ---- Main Seed ----
async function seedNekneks() {
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // Supabase client for storage
  let supabase: ReturnType<typeof createClient> | null = null;
  if (SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    // Create bucket if not exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === STORAGE_BUCKET)) {
      await supabase.storage.createBucket(STORAGE_BUCKET, { public: true });
      console.log(`📦 Created storage bucket: ${STORAGE_BUCKET}`);
    }
  } else {
    console.log("⚠️ No SUPABASE_SERVICE_ROLE_KEY — skipping photo uploads, using placeholders");
  }

  console.log("🔫 Seeding NekNeks Airsoft Shop...\n");

  // 1. Parse products from filesystem
  console.log("📂 Scanning product images...");
  const parsed = scanDirectory(NEKNEKS_DIR);
  console.log(`  ↳ Found ${parsed.length} products\n`);

  // 2. Tenant
  console.log("📦 Creating tenant...");
  let [tenant] = await db.insert(schema.tenants).values({
    name: "NekNeks Airsoft Shop",
    slug: "nekneks-airsoft",
    settings: { timezone: "Asia/Manila", currency: "PHP", locale: "en-PH" },
  }).onConflictDoNothing({ target: schema.tenants.slug }).returning();

  if (!tenant) {
    [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, "nekneks-airsoft")).limit(1);
    console.log("  ↳ Tenant already exists, reusing.");
  } else {
    console.log(`  ↳ Created: ${tenant.name}`);
  }

  // 3. System roles
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
      const rows = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
      for (const r of rows) roleMap.set(r.slug, r.id);
      break;
    }
  }

  // 4. Admin user
  console.log("\n👤 Creating admin user...");
  const passwordHash = await hashPassword("NekNeks2024!");
  let [adminUser] = await db.insert(schema.users).values({
    email: "nekneks@demo.com",
    passwordHash,
    fullName: "NekNeks Admin",
    emailVerified: true,
  }).onConflictDoNothing({ target: schema.users.email }).returning();

  if (!adminUser) {
    [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, "nekneks@demo.com")).limit(1);
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
    console.log("  ↳ Assigned as owner (PIN: 1234, hashed)");
  }

  // 5. Enable modules
  console.log("\n📦 Enabling modules...");
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

  // 6. Categories — GUNS as parent
  console.log("\n📂 Creating categories...");
  const [gunsCat] = await db.insert(schema.catalogCategories).values({
    tenantId: tenant.id,
    name: "Guns",
    slug: "guns",
    sortOrder: 0,
  }).onConflictDoNothing().returning();

  let gunsCatId: string;
  if (gunsCat) {
    gunsCatId = gunsCat.id;
    console.log(`  ↳ Created: Guns`);
  } else {
    const rows = await db.select().from(schema.catalogCategories)
      .where(and(eq(schema.catalogCategories.tenantId, tenant.id), eq(schema.catalogCategories.slug, "guns")));
    gunsCatId = rows[0].id;
    console.log(`  ↳ Guns already exists`);
  }

  // 7. Subcategories from folder structure
  console.log("\n📁 Creating subcategories...");
  const subcatNames = [
    { name: "HPA Rifles", slug: "hpa-rifles", folder: "HPA RIFLES" },
    { name: "E&C AEG Rifles", slug: "ec-aeg-rifles", folder: "E&C AEG RIFLES" },
    { name: "China AEG Rifles", slug: "china-aeg-rifles", folder: "CHINA AEG RIFLES" },
    { name: "GBB Pistols", slug: "gbb-pistols", folder: "GBB PISTOLS" },
    { name: "Hi-End AEG Rifles", slug: "hi-end-aeg-rifles", folder: "HI-END AEG RIFLES" },
    { name: "GBB Rifles", slug: "gbb-rifles", folder: "GBB RIFLES" },
    { name: "Sniper Rifles", slug: "sniper-rifles", folder: "SNIPER RIFLES" },
  ];

  const subcatMap = new Map<string, string>(); // folder name -> id
  for (let i = 0; i < subcatNames.length; i++) {
    const s = subcatNames[i];
    const [sub] = await db.insert(schema.catalogSubcategories).values({
      tenantId: tenant.id,
      categoryId: gunsCatId,
      name: s.name,
      slug: s.slug,
      sortOrder: i,
    }).onConflictDoNothing().returning();
    if (sub) {
      subcatMap.set(s.folder, sub.id);
      console.log(`  ↳ ${sub.name}`);
    } else {
      const rows = await db.select().from(schema.catalogSubcategories)
        .where(and(eq(schema.catalogSubcategories.tenantId, tenant.id), eq(schema.catalogSubcategories.slug, s.slug)));
      if (rows[0]) subcatMap.set(s.folder, rows[0].id);
    }
  }

  // 8. Import products
  console.log("\n📦 Importing products...");
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];

    // Generate slug from name + variant
    const slugBase = (p.name + (p.variant ? `-${p.variant}` : ""))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 290);
    const slug = `${slugBase}-${i}`;

    // Display name with variant
    const displayName = p.variant ? `${p.name} (${p.variant})` : p.name;

    // Find subcategory
    const subcatId = subcatMap.get(p.subcategory);
    if (!subcatId) {
      // Try parent folder
      const parentFolder = p.subcategory;
      if (!subcatMap.has(parentFolder)) {
        skipped++;
        continue;
      }
    }

    const [product] = await db.insert(schema.catalogProducts).values({
      tenantId: tenant.id,
      name: displayName,
      slug,
      brand: p.brand,
      price: p.price.toFixed(2),
      categoryId: gunsCatId,
      stockStatus: p.stockStatus,
      isFeatured: false,
      isNew: false,
      sortOrder: i,
    }).onConflictDoNothing().returning();

    if (!product) { skipped++; continue; }

    // Link subcategory
    if (subcatId) {
      await db.insert(schema.catalogProductSubcategories).values({
        productId: product.id,
        subcategoryId: subcatId,
      }).onConflictDoNothing();
    }

    // Upload photo to Supabase Storage or use placeholder
    let photoUrl: string;
    if (supabase) {
      try {
        const fileBuffer = fs.readFileSync(p.filePath);
        const storagePath = `products/${slug}.jpg`;
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);
        photoUrl = publicUrl;
      } catch (err: any) {
        photoUrl = `https://placehold.co/600x400/1a1f16/e8e6e0?text=${encodeURIComponent(displayName)}`;
      }
    } else {
      photoUrl = `https://placehold.co/600x400/1a1f16/e8e6e0?text=${encodeURIComponent(displayName)}`;
    }

    await db.insert(schema.catalogProductPhotos).values({
      tenantId: tenant.id,
      productId: product.id,
      url: photoUrl,
      altText: displayName,
      isPrimary: true,
    }).onConflictDoNothing();

    imported++;
    if (imported % 50 === 0) console.log(`  ↳ Imported ${imported}...`);
  }

  console.log(`  ↳ Total imported: ${imported}, skipped: ${skipped}`);

  console.log("\n" + "=".repeat(50));
  console.log("✅ NekNeks Airsoft Shop seed complete!");
  console.log(`\nTenant: NekNeks Airsoft Shop (nekneks-airsoft)`);
  console.log(`Login: nekneks@demo.com / NekNeks2024!`);
  console.log(`PIN: 1234 (hashed)`);
  console.log(`Products: ${imported} | Categories: 1 | Subcategories: ${subcatMap.size}`);
  console.log("=".repeat(50));

  await client.end();
  process.exit(0);
}

seedNekneks().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
