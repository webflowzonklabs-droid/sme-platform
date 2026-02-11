export { defineModule, getModuleRegistry, getModule } from "./registry";
export { enableModule, disableModule, isModuleEnabled, getEnabledModules } from "./lifecycle";
export type { ModuleConfig } from "./registry";

// Force module registration on import
export { catalogModule } from "./catalog/index";
