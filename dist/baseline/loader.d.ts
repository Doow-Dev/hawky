/**
 * Baseline Loader
 *
 * Loads and validates the .hawky/baseline.json file.
 * Handles missing baseline gracefully (returns null).
 */
import type { Baseline, BaselineLoadResult } from './types';
/**
 * Load the baseline file from the specified path.
 *
 * @param baselinePath - Path to the baseline file (relative to cwd or absolute)
 * @returns BaselineLoadResult with the loaded baseline or error info
 */
export declare function loadBaseline(baselinePath?: string): BaselineLoadResult;
/**
 * Load baseline from cwd using default path.
 * Convenience wrapper around loadBaseline().
 */
export declare function loadBaselineFromCwd(): BaselineLoadResult;
/**
 * Get a Set of all violation hashes from a baseline.
 * Useful for fast lookup during violation matching.
 *
 * @param baseline - The baseline to extract hashes from
 * @returns Set of violation hash strings
 */
export declare function getHashSet(baseline: Baseline): Set<string>;
/**
 * Get violation count by gate.
 *
 * @param baseline - The baseline to analyze
 * @returns Object with counts per gate
 */
export declare function getViolationCounts(baseline: Baseline): Record<'typescript' | 'eslint' | 'semgrep' | 'gitleaks' | 'total', number>;
//# sourceMappingURL=loader.d.ts.map