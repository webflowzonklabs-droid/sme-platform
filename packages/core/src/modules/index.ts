export { defineModule, getModuleRegistry, getModule } from "./registry";
export { enableModule, disableModule, isModuleEnabled, getEnabledModules } from "./lifecycle";
export type { ModuleConfig } from "./registry";

// NOTE: Module registrations (catalogModule, notesModule) are NOT re-exported here
// to avoid circular dependencies. They are imported directly where needed
// (e.g., in core/src/index.ts or registered via side-effect imports).
