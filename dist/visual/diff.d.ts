/**
 * Visual Diff Module
 *
 * Compares screenshots using lens-cli pixel diff for visual regression detection.
 * Uses anti-aliasing detection to reduce false positives from font rendering.
 *
 * S067: lens-cli Pixel Diff Integration
 */
import type { DiffOptions, DiffResult } from './types';
/**
 * Compare two screenshots using lens-cli pixel diff
 *
 * Uses lens diff which:
 * - Compares pixels with configurable color tolerance
 * - Detects anti-aliased edges to reduce false positives
 * - Outputs diff image highlighting mismatches
 *
 * @param baselinePath - Path to baseline screenshot
 * @param currentPath - Path to current screenshot
 * @param options - Diff options including threshold
 * @returns Diff result with percentage, matched status, and diff image path
 */
export declare function diffScreenshots(baselinePath: string, currentPath: string, options?: DiffOptions): Promise<DiffResult>;
/**
 * Compare multiple screenshot pairs in batch
 *
 * Useful for comparing all screenshots from a visual test run.
 *
 * @param pairs - Array of [baseline, current] path pairs
 * @param options - Diff options applied to all comparisons
 * @returns Array of diff results in same order as input pairs
 */
export declare function diffScreenshotBatch(pairs: Array<[string, string]>, options?: DiffOptions): Promise<DiffResult[]>;
/**
 * Quick check if two screenshots match within threshold
 *
 * More efficient than full diff when you just need pass/fail.
 *
 * @param baselinePath - Path to baseline screenshot
 * @param currentPath - Path to current screenshot
 * @param threshold - Maximum allowed difference percentage (default: 0.1)
 * @returns Whether screenshots match within threshold
 */
export declare function screenshotsMatch(baselinePath: string, currentPath: string, threshold?: number): Promise<boolean>;
//# sourceMappingURL=diff.d.ts.map