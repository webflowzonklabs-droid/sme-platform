CREATE TABLE "catalog_attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"type" varchar(20) NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "catalog_product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt_text" varchar(300),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_product_subcategories" (
	"product_id" uuid NOT NULL,
	"subcategory_id" uuid NOT NULL,
	CONSTRAINT "catalog_product_subcategories_product_id_subcategory_id_pk" PRIMARY KEY("product_id","subcategory_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"slug" varchar(300) NOT NULL,
	"brand" varchar(200),
	"description" text,
	"price" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"category_id" uuid NOT NULL,
	"stock_status" varchar(20) DEFAULT 'in_stock' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "catalog_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN "pin_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN "pin_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_attribute_definitions" ADD CONSTRAINT "catalog_attribute_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_attributes" ADD CONSTRAINT "catalog_product_attributes_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_attributes" ADD CONSTRAINT "catalog_product_attributes_attribute_definition_id_catalog_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."catalog_attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_photos" ADD CONSTRAINT "catalog_product_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_photos" ADD CONSTRAINT "catalog_product_photos_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_subcategories" ADD CONSTRAINT "catalog_product_subcategories_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product_subcategories" ADD CONSTRAINT "catalog_product_subcategories_subcategory_id_catalog_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."catalog_subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_subcategories" ADD CONSTRAINT "catalog_subcategories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_subcategories" ADD CONSTRAINT "catalog_subcategories_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_subcategories" ADD CONSTRAINT "catalog_subcategories_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_catalog_attr_defs_tenant" ON "catalog_attribute_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_attr_defs_slug" ON "catalog_attribute_definitions" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "idx_catalog_categories_tenant" ON "catalog_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_categories_slug" ON "catalog_categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_attrs_product" ON "catalog_product_attributes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_attrs_def" ON "catalog_product_attributes" USING btree ("attribute_definition_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_photos_product" ON "catalog_product_photos" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_photos_tenant" ON "catalog_product_photos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_subcategories_product" ON "catalog_product_subcategories" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_product_subcategories_subcategory" ON "catalog_product_subcategories" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_products_tenant" ON "catalog_products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_products_category" ON "catalog_products" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_products_slug" ON "catalog_products" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "idx_catalog_products_stock" ON "catalog_products" USING btree ("tenant_id","stock_status");--> statement-breakpoint
CREATE INDEX "idx_catalog_products_featured" ON "catalog_products" USING btree ("tenant_id","is_featured");--> statement-breakpoint
CREATE INDEX "idx_catalog_subcategories_tenant" ON "catalog_subcategories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_subcategories_category" ON "catalog_subcategories" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_subcategories_slug" ON "catalog_subcategories" USING btree ("tenant_id","slug");--> statement-breakpoint
-- RLS: Enable row-level security on all catalog tables
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_subcategories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_product_subcategories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_product_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_attribute_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_product_attributes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- RLS policies for tenant isolation
CREATE POLICY tenant_isolation_catalog_categories ON "catalog_categories"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_catalog_subcategories ON "catalog_subcategories"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_catalog_products ON "catalog_products"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_catalog_product_photos ON "catalog_product_photos"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_catalog_attribute_definitions ON "catalog_attribute_definitions"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

-- Join tables: policy based on related product's tenant
CREATE POLICY tenant_isolation_catalog_product_subcategories ON "catalog_product_subcategories"
  USING (product_id IN (
    SELECT id FROM catalog_products WHERE tenant_id = current_setting('app.current_tenant_id', true)::UUID
  ));--> statement-breakpoint

CREATE POLICY tenant_isolation_catalog_product_attributes ON "catalog_product_attributes"
  USING (product_id IN (
    SELECT id FROM catalog_products WHERE tenant_id = current_setting('app.current_tenant_id', true)::UUID
  ));
