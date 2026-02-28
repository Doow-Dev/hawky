/**
 * PR Comment Reporter
 *
 * Generates markdown summary of gate results and posts as a PR comment.
 * Updates existing Hawky comment instead of creating duplicates.
 */
import type { ReportData, ReportConfig } from './types';
/**
 * Marker text to identify Hawky comments
 * Used to find and update existing comments
 */
declare const HAWKY_COMMENT_MARKER = "## Hawky Review Summary";
/**
 * Generate the full PR comment markdown
 */
export declare function generatePRComment(data: ReportData, config?: ReportConfig): string;
/**
 * Post or update PR comment with gate results
 */
export declare function postPRComment(data: ReportData, token: string, config?: ReportConfig): Promise<{
    success: boolean;
    commentId?: number;
    error?: string;
}>;
/**
 * Export marker for testing
 */
export { HAWKY_COMMENT_MARKER };
//# sourceMappingURL=pr-comment.d.ts.map