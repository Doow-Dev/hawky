/**
 * Visual Report Module
 *
 * Generates markdown reports for visual regression test results.
 * Creates collapsible sections per route with diff details.
 *
 * S068: Visual Change Summary
 */
import type { VisualTestResult } from './types';
/**
 * Format visual regression report
 *
 * Generates a markdown report with:
 * - Summary statistics
 * - Collapsible sections per route
 * - Diff percentages and image links
 *
 * @param results - Array of visual test results
 * @returns Formatted markdown report
 */
export declare function formatVisualReport(results: VisualTestResult[]): string;
/**
 * Format a compact summary line for PR comment
 *
 * @param results - Array of visual test results
 * @returns Single-line summary
 */
export declare function formatVisualSummary(results: VisualTestResult[]): string;
/**
 * Check if any visual tests failed
 *
 * @param results - Array of visual test results
 * @returns Whether any tests failed or errored
 */
export declare function hasVisualRegressions(results: VisualTestResult[]): boolean;
//# sourceMappingURL=report.d.ts.map