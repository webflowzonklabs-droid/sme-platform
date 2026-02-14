# Costing Module — Spec v1

## Overview
Recipe costing & raw materials management module. Tracks ingredient prices over time, manages hierarchical recipes (raw → base → final), calculates COGS with yield loss, and shows impact when prices change.

## Data Model

### 1. Inventory Items (Raw Materials + Packaging)
```
costing_inventory_items
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (varchar) — "All Purpose Flour", "Egg Tart Box"
├── brand (varchar, nullable) — "Laciate", "Emborg"
├── unit_type (enum: 'weight', 'piece') — weight=priced per kg/g, piece=per item
├── unit (varchar) — "kg", "g", "L", "mL", "piece"
├── unit_size_grams (numeric, nullable) — for weight items: purchase size in grams (1kg = 1000)
├── category (varchar) — "critical", "secondary", "packaging", custom tags
├── tags (text[]) — flexible tagging
├── primary_supplier (varchar, nullable)
├── secondary_supplier (varchar, nullable)
├── notes (text, nullable)
├── is_active (boolean)
├── created_at, updated_at, deleted_at, deleted_by
```

### 2. Price History
```
costing_price_history
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── item_id (uuid, FK → costing_inventory_items)
├── purchase_price (numeric 12,4) — price paid for 1 purchase unit
├── price_per_unit (numeric 12,6) — calculated: price per gram or per piece
├── supplier (varchar, nullable) — which supplier this price was from
├── effective_date (date) — when this price became active
├── notes (text, nullable)
├── created_at
```
- Latest price by effective_date is the "current" price
- All historical entries preserved for trending

### 3. Recipes
```
costing_recipes
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (varchar) — "Mango Jam", "Regular Egg Tart"
├── type (enum: 'base', 'final') — base=intermediate, final=sellable product
├── version (integer, default 1) — recipe version number
├── parent_recipe_id (uuid, nullable, FK → self) — links versions together
├── yield_loss_pct (numeric 5,2, default 0) — e.g., 5.00 for 5%
├── raw_weight (numeric 12,4, nullable) — total input weight
├── net_weight (numeric 12,4, nullable) — after yield loss
├── total_cost (numeric 12,4, nullable) — calculated
├── cost_per_gram (numeric 12,6, nullable) — calculated (total_cost / net_weight)
├── cost_per_piece (numeric 12,4, nullable) — for piece-based final products
├── selling_price (numeric 12,2, nullable) — final products only
├── vat_pct (numeric 5,2, default 12) — VAT percentage
├── discount_pct (numeric 5,2, default 0)
├── cogs_pct (numeric 5,2, nullable) — calculated
├── is_current (boolean, default true) — is this the active version?
├── is_active (boolean)
├── notes (text, nullable)
├── created_at, updated_at, deleted_at, deleted_by
```

### 4. Recipe Ingredients (line items)
```
costing_recipe_ingredients
├── id (uuid, PK)
├── recipe_id (uuid, FK → costing_recipes)
├── ingredient_type (enum: 'raw', 'base') — raw=inventory item, base=another recipe
├── inventory_item_id (uuid, nullable, FK → costing_inventory_items) — if type='raw'
├── base_recipe_id (uuid, nullable, FK → costing_recipes) — if type='base'
├── amount (numeric 12,4) — grams or pieces
├── unit_cost (numeric 12,6) — snapshot of cost at time of calc
├── extended_cost (numeric 12,4) — amount × unit_cost
├── sort_order (integer)
├── created_at
```

### 5. Costing Snapshots (version a cost calculation at a point in time)
```
costing_snapshots
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── recipe_id (uuid, FK → costing_recipes)
├── snapshot_date (timestamptz)
├── total_cost (numeric 12,4)
├── cost_per_gram (numeric 12,6, nullable)
├── cogs_pct (numeric 5,2, nullable)
├── ingredient_costs (jsonb) — full breakdown at snapshot time
├── notes (text, nullable)
├── created_at
```

## Key Calculations

### Base Product Costing
```
raw_weight = sum(ingredient amounts)
net_weight = raw_weight × (1 - yield_loss_pct/100)
total_cost = sum(ingredient extended costs)
cost_per_gram = total_cost / net_weight
```

### Final Product Costing
```
total_cost = sum(ingredient extended costs) + packaging costs
selling_price_with_vat = selling_price × (1 + vat_pct/100) × (1 - discount_pct/100)
cogs_pct = total_cost / selling_price × 100
cogs_net = total_cost / selling_price_with_vat × 100
profit_per_unit = selling_price_with_vat - total_cost
```

### Price Impact Analysis
When an inventory item price changes:
1. Find all recipes using that item
2. Recalculate those recipe costs
3. Find all final products using affected base recipes
4. Cascade recalculation up the chain
5. Show before/after comparison

## UI Pages

### Inventory Items
- List with filters (category, supplier, active/inactive)
- Add/edit item with current price
- Price history chart per item
- Bulk import from spreadsheet

### Recipes
- List with tabs: Base Products | Final Products
- Recipe builder (add ingredients from inventory or base recipes)
- Auto-calculate costs as you build
- Version history
- Scale recipe (multiply all amounts by factor)
- Duplicate as variation

### Costing Dashboard
- Overview: all final products with COGS %
- Price impact simulator: "What if flour goes to ₱X?"
- Cost trends over time
- Alerts: items with COGS > threshold

## Module Registration
- Module ID: `costing`
- Dependencies: none (standalone)
- Permissions: costing.view, costing.manage, costing.admin
- Nav: Costing → Inventory Items, Recipes, Dashboard

## Notes
- All tables get tenant_id + RLS
- Soft delete consistent with existing patterns
- Price per unit auto-calculated on price entry
- Recipe versioning: new version copies ingredients, marks old as not current
