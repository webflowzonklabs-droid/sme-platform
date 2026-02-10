import type { ModuleNavItem } from "@sme/shared";

// ============================================
// Module Registry — in-memory registration
// ============================================

export interface ModuleConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  dependencies: string[];
  permissions: string[];
  roleDefaults: Record<string, string[]>;
  navigation: ModuleNavItem[];
  /** tRPC router for this module — attached by the module package */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router?: any;
}

/** In-memory registry of all registered modules */
const moduleRegistry = new Map<string, ModuleConfig>();

/**
 * Register a module definition.
 * Called at startup by each module package.
 */
export function defineModule(config: ModuleConfig): ModuleConfig {
  // Validate dependencies exist (they might not be registered yet at startup,
  // so we do a deferred check in resolveModuleDependencies)
  moduleRegistry.set(config.id, config);
  return config;
}

/**
 * Get all registered modules.
 */
export function getModuleRegistry(): Map<string, ModuleConfig> {
  return moduleRegistry;
}

/**
 * Get a specific module by ID.
 */
export function getModule(moduleId: string): ModuleConfig | undefined {
  return moduleRegistry.get(moduleId);
}

/**
 * Resolve module dependencies — ensures all deps are registered.
 * Call after all modules have been registered.
 */
export function resolveModuleDependencies(): void {
  for (const [moduleId, config] of moduleRegistry) {
    for (const dep of config.dependencies) {
      if (!moduleRegistry.has(dep)) {
        throw new Error(
          `Module "${moduleId}" depends on "${dep}" which is not registered`
        );
      }
    }
  }
}

/**
 * Get modules in dependency order (topological sort).
 */
export function getModulesInOrder(): ModuleConfig[] {
  const visited = new Set<string>();
  const result: ModuleConfig[] = [];

  function visit(moduleId: string) {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);

    const mod = moduleRegistry.get(moduleId);
    if (!mod) return;

    for (const dep of mod.dependencies) {
      visit(dep);
    }

    result.push(mod);
  }

  for (const moduleId of moduleRegistry.keys()) {
    visit(moduleId);
  }

  return result;
}
