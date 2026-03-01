/**
 * Stack Module Registry
 *
 * S087: Central registry for stack module implementations.
 * Modules register themselves and can be looked up by stack type.
 */
import type { StackModule, StackType } from './types';
/**
 * Register a stack module
 * @param module - Stack module implementation
 */
export declare function registerStackModule(module: StackModule): void;
/**
 * Get a registered stack module by type
 * @param type - Stack type to look up
 * @returns Stack module or undefined if not registered
 */
export declare function getStackModule(type: StackType): StackModule | undefined;
/**
 * Get all registered stack modules
 * @returns Array of all registered modules
 */
export declare function getAllStackModules(): StackModule[];
/**
 * Check if a stack module is registered
 * @param type - Stack type to check
 * @returns true if module is registered
 */
export declare function hasStackModule(type: StackType): boolean;
/**
 * Get all registered stack types
 * @returns Array of registered stack type names
 */
export declare function getRegisteredStackTypes(): StackType[];
/**
 * Clear the registry (for testing)
 */
export declare function clearRegistry(): void;
/**
 * Get registry size (for testing)
 */
export declare function getRegistrySize(): number;
//# sourceMappingURL=registry.d.ts.map