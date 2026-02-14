CREATE TABLE "costing_inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"brand" varchar(200),
	"unit_type" varchar(20) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"unit_size_grams" numeric(12, 4),
	"category" varchar(100) NOT NULL,
	"tags" text[],
	"primary_supplier" varchar(200),
	"secondary_supplier" varchar(200),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "costing_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"purchase_price" numeric(12, 4) NOT NULL,
	"price_per_unit" numeric(12, 6) NOT NULL,
	"supplier" varchar(200),
	"effective_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "costing_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"type" varchar(20) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_recipe_id" uuid,
	"yield_loss_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"raw_weight" numeric(12, 4),
	"net_weight" numeric(12, 4),
	"total_cost" numeric(12, 4),
	"cost_per_gram" numeric(12, 6),
	"cost_per_piece" numeric(12, 4),
	"selling_price" numeric(12, 2),
	"vat_pct" numeric(5, 2) DEFAULT '12' NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cogs_pct" numeric(5, 2),
	"is_current" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "costing_recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_type" varchar(20) NOT NULL,
	"inventory_item_id" uuid,
	"base_recipe_id" uuid,
	"amount" numeric(12, 4) NOT NULL,
	"unit_cost" numeric(12, 6) NOT NULL,
	"extended_cost" numeric(12, 4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "costing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"snapshot_date" timestamp with time zone DEFAULT now() NOT NULL,
	"total_cost" numeric(12, 4) NOT NULL,
	"cost_per_gram" numeric(12, 6),
	"cogs_pct" numeric(5, 2),
	"ingredient_costs" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Foreign keys
ALTER TABLE "costing_inventory_items" ADD CONSTRAINT "costing_inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_inventory_items" ADD CONSTRAINT "costing_inventory_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_price_history" ADD CONSTRAINT "costing_price_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_price_history" ADD CONSTRAINT "costing_price_history_item_id_costing_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."costing_inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipes" ADD CONSTRAINT "costing_recipes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipes" ADD CONSTRAINT "costing_recipes_parent_recipe_id_costing_recipes_id_fk" FOREIGN KEY ("parent_recipe_id") REFERENCES "public"."costing_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipes" ADD CONSTRAINT "costing_recipes_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipe_ingredients" ADD CONSTRAINT "costing_recipe_ingredients_recipe_id_costing_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."costing_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipe_ingredients" ADD CONSTRAINT "costing_recipe_ingredients_inventory_item_id_costing_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."costing_inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_recipe_ingredients" ADD CONSTRAINT "costing_recipe_ingredients_base_recipe_id_costing_recipes_id_fk" FOREIGN KEY ("base_recipe_id") REFERENCES "public"."costing_recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_snapshots" ADD CONSTRAINT "costing_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_snapshots" ADD CONSTRAINT "costing_snapshots_recipe_id_costing_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."costing_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Indexes
CREATE INDEX "idx_costing_items_tenant" ON "costing_inventory_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_costing_items_category" ON "costing_inventory_items" USING btree ("tenant_id", "category");--> statement-breakpoint
CREATE INDEX "idx_costing_items_active" ON "costing_inventory_items" USING btree ("tenant_id", "is_active");--> statement-breakpoint
CREATE INDEX "idx_costing_price_history_tenant" ON "costing_price_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_costing_price_history_item" ON "costing_price_history" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_costing_price_history_date" ON "costing_price_history" USING btree ("item_id", "effective_date");--> statement-breakpoint
CREATE INDEX "idx_costing_recipes_tenant" ON "costing_recipes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_costing_recipes_type" ON "costing_recipes" USING btree ("tenant_id", "type");--> statement-breakpoint
CREATE INDEX "idx_costing_recipes_parent" ON "costing_recipes" USING btree ("parent_recipe_id");--> statement-breakpoint
CREATE INDEX "idx_costing_recipes_current" ON "costing_recipes" USING btree ("tenant_id", "is_current");--> statement-breakpoint
CREATE INDEX "idx_costing_ingredients_recipe" ON "costing_recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_costing_ingredients_item" ON "costing_recipe_ingredients" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "idx_costing_ingredients_base_recipe" ON "costing_recipe_ingredients" USING btree ("base_recipe_id");--> statement-breakpoint
CREATE INDEX "idx_costing_snapshots_tenant" ON "costing_snapshots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_costing_snapshots_recipe" ON "costing_snapshots" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_costing_snapshots_date" ON "costing_snapshots" USING btree ("recipe_id", "snapshot_date");--> statement-breakpoint
-- RLS: Enable row-level security on all costing tables
ALTER TABLE "costing_inventory_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "costing_price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "costing_recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "costing_recipe_ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "costing_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- RLS policies for tenant isolation
CREATE POLICY tenant_isolation_costing_inventory_items ON "costing_inventory_items"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_costing_price_history ON "costing_price_history"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_costing_recipes ON "costing_recipes"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

CREATE POLICY tenant_isolation_costing_snapshots ON "costing_snapshots"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);--> statement-breakpoint

-- Join table: policy based on related recipe's tenant
CREATE POLICY tenant_isolation_costing_recipe_ingredients ON "costing_recipe_ingredients"
  USING (recipe_id IN (
    SELECT id FROM costing_recipes WHERE tenant_id = current_setting('app.current_tenant_id', true)::UUID
  ));
