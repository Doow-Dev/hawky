/**
 * Step Summary Reporter
 *
 * Generates GitHub Actions step summary for gate results.
 * Uses @actions/core.summary API for rich markdown formatting.
 */
import type { ReportData, ReportConfig } from './types';
/**
 * Generate and write the step summary using @actions/core.summary API
 */
export declare function writeStepSummary(data: ReportData, config?: ReportConfig): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Generate step summary markdown as a string (for testing)
 */
export declare function generateStepSummaryMarkdown(data: ReportData, config?: ReportConfig): string;
//# sourceMappingURL=step-summary.d.ts.map