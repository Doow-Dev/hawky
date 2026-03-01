/**
 * PR Comment Formatter (S076)
 *
 * Formats LLM review findings as clean GitHub PR comments.
 * Features:
 * - Proper markdown with collapsible sections
 * - GitHub line links for inline navigation
 * - Integration with the existing Hawky report system
 * - Severity-based grouping and icons
 */
import type { LLMReviewResult } from './review';
import type { SpecComplianceResult } from './spec-compliance';
/**
 * Options for formatting an LLM PR comment
 */
export interface LLMCommentOptions {
    /** Repository in "owner/repo" format — used for GitHub line links */
    repository: string;
    /** PR head commit SHA — used for GitHub line links */
    commitSha: string;
    /** PR number */
    prNumber: number;
    /** Whether to include collapsible sections (default: true) */
    includeDetails?: boolean;
    /** Whether to include timing and cost info (default: false) */
    includeMetadata?: boolean;
    /** Maximum issues to show per severity bucket before collapsing (default: 5) */
    maxIssuesPerSection?: number;
}
/**
 * Combined LLM findings for a PR comment
 */
export interface LLMFindings {
    /** Core review result */
    review?: LLMReviewResult;
    /** Spec compliance result (optional) */
    compliance?: SpecComplianceResult;
}
/**
 * Result of generating a PR comment
 */
export interface LLMCommentResult {
    /** Generated markdown */
    body: string;
    /** Number of errors in comment */
    errorCount: number;
    /** Number of warnings in comment */
    warningCount: number;
    /** Number of info/suggestions in comment */
    infoCount: number;
    /** Whether any blocking issues were found */
    hasBlockingIssues: boolean;
}
/** Marker used to identify Hawky LLM comments for updates */
export declare const LLM_COMMENT_MARKER = "<!-- hawky-llm-review -->";
/**
 * Generate a GitHub permalink to a specific file and line.
 *
 * Format: https://github.com/owner/repo/blob/{sha}/{file}#L{line}
 */
export declare function generateGitHubLineLink(repository: string, commitSha: string, file: string, line: number): string;
/**
 * Generate a formatted PR comment for LLM findings
 *
 * Produces a clean, structured GitHub PR comment with:
 * - Overall status summary
 * - Collapsible error/warning/info sections with GitHub line links
 * - Optional spec compliance section
 * - Metadata (confidence, cost) if requested
 */
export declare function formatLLMComment(findings: LLMFindings, options: LLMCommentOptions): LLMCommentResult;
/**
 * Generate an overall status badge for the LLM review
 */
export declare function generateLLMStatusBadge(result: LLMCommentResult): string;
//# sourceMappingURL=pr-comment-formatter.d.ts.map