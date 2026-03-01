/**
 * Stack Runner
 *
 * S095: Coordinates detection and execution of stack gates across multiple stacks.
 * Handles polyglot repos gracefully with tool-not-found fallbacks.
 */
import type { StackType, StackGateResult, StackRunResult, StacksConfig, StackOverrideConfig, StackModule } from './types';
import './modules/index';
/**
 * Run stack gates for a repository
 *
 * @param rootDir - Repository root directory
 * @param config - Stack configuration from .hawky.yml
 * @returns Results from all stack gates
 */
export declare function runStackGates(rootDir: string, config?: StacksConfig): Promise<StackRunResult>;
/**
 * Run a single stack's gates
 */
export declare function runSingleStackGates(stack: StackType, rootDir: string, config?: StackOverrideConfig): Promise<StackGateResult[]>;
/**
 * Get all registered stack modules
 */
export declare function getAvailableStacks(): StackModule[];
/**
 * Check if a stack can be detected in a directory
 */
export declare function canDetectStack(stack: StackType, rootDir: string): Promise<boolean>;
//# sourceMappingURL=runner.d.ts.map