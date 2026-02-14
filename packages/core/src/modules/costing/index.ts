import { defineModule } from "../registry";
import { costingRouter } from "./router";

// ============================================
// Costing Module — recipe costing & raw materials management
// ============================================

export const costingModule = defineModule({
  id: "costing",
  name: "Recipe Costing",
  version: "1.0.0",
  description:
    "Recipe costing, raw materials management, price tracking, and COGS analysis",
  dependencies: [],

  permissions: [
    "costing:view",
    "costing:manage",
    "costing:admin",
  ],

  roleDefaults: {
    owner: ["costing:*"],
    admin: ["costing:*"],
    manager: ["costing:view", "costing:manage"],
    operator: ["costing:view"],
    viewer: ["costing:view"],
  },

  navigation: [
    {
      label: "Inventory Items",
      icon: "Package",
      href: "/costing/inventory",
      permission: "costing:view",
    },
    {
      label: "Recipes",
      icon: "ChefHat",
      href: "/costing/recipes",
      permission: "costing:view",
    },
    {
      label: "Dashboard",
      icon: "BarChart3",
      href: "/costing/dashboard",
      permission: "costing:view",
    },
  ],

  router: costingRouter,
});

export { costingRouter } from "./router";
export {
  costingInventoryItems,
  costingPriceHistory,
  costingRecipes,
  costingRecipeIngredients,
  costingSnapshots,
  type CostingInventoryItem,
  type NewCostingInventoryItem,
  type CostingPriceHistory,
  type NewCostingPriceHistory,
  type CostingRecipe,
  type NewCostingRecipe,
  type CostingRecipeIngredient,
  type NewCostingRecipeIngredient,
  type CostingSnapshot,
  type NewCostingSnapshot,
} from "./schema";
