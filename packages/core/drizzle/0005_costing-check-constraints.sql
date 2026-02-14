-- Check constraints for costing module enum columns
ALTER TABLE "costing_inventory_items" ADD CONSTRAINT chk_unit_type CHECK (unit_type IN ('weight', 'piece'));
--> statement-breakpoint
ALTER TABLE "costing_recipes" ADD CONSTRAINT chk_recipe_type CHECK (type IN ('base', 'final'));
--> statement-breakpoint
ALTER TABLE "costing_recipe_ingredients" ADD CONSTRAINT chk_ingredient_type CHECK (ingredient_type IN ('raw', 'base'));
