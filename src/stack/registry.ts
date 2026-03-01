/**
 * Stack Module Registry
 *
 * S087: Central registry for stack module implementations.
 * Modules register themselves and can be looked up by stack type.
 */

import type { StackModule, StackType } from './types';

/**
 * Internal registry map
 */
const registry = new Map<StackType, StackModule>();

/**
 * Register a stack module
 * @param module - Stack module implementation
 */
export function registerStackModule(module: StackModule): void {
  if (registry.has(module.name)) {
    throw new Error(`Stack module '${module.name}' is already registered`);
  }
  registry.set(module.name, module);
}

/**
 * Get a registered stack module by type
 * @param type - Stack type to look up
 * @returns Stack module or undefined if not registered
 */
export function getStackModule(type: StackType): StackModule | undefined {
  return registry.get(type);
}

/**
 * Get all registered stack modules
 * @returns Array of all registered modules
 */
export function getAllStackModules(): StackModule[] {
  return Array.from(registry.values());
}

/**
 * Check if a stack module is registered
 * @param type - Stack type to check
 * @returns true if module is registered
 */
export function hasStackModule(type: StackType): boolean {
  return registry.has(type);
}

/**
 * Get all registered stack types
 * @returns Array of registered stack type names
 */
export function getRegisteredStackTypes(): StackType[] {
  return Array.from(registry.keys());
}

/**
 * Clear the registry (for testing)
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Get registry size (for testing)
 */
export function getRegistrySize(): number {
  return registry.size;
}
