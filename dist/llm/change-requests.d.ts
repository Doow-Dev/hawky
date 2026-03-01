/**
 * Change Request Generation (S077)
 *
 * Generates actionable change requests from LLM findings.
 * Formats as GitHub review comments with inline code suggestions.
 *
 * Features:
 * - Converts ReviewIssues into GitHub pull_request review comment format
 * - Supports inline code suggestions (```suggestion blocks)
 * - Groups related changes for coherent review threads
 * - Prioritizes by severity
 */
import type { ReviewIssue } from './review';
import type { SpecComplianceResult } from './spec-compliance';
/**
 * A single GitHub review comment (inline comment on a PR diff)
 */
export interface ReviewComment {
    /** File path (relative to repo root) */
    path: string;
    /** Line number in the new file (for single-line comments) */
    line: number;
    /** Start line for multi-line comments */
    startLine?: number;
    /** Side of the diff ('RIGHT' = new file, 'LEFT' = old file) */
    side: 'RIGHT' | 'LEFT';
    /** Comment body in GitHub Flavored Markdown */
    body: string;
}
/**
 * A GitHub review — collection of comments plus an overall verdict
 */
export interface GitHubReview {
    /** Review body/summary (shown at top of review) */
    body: string;
    /** Review event type */
    event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE';
    /** Inline comments on the diff */
    comments: ReviewComment[];
}
/**
 * Options for change request generation
 */
export interface ChangeRequestOptions {
    /** Repository in "owner/repo" format */
    repository: string;
    /** PR head commit SHA (required for GitHub review comments) */
    commitSha: string;
    /** Whether to include code suggestions (```suggestion blocks) */
    includeSuggestions?: boolean;
    /** Minimum severity to generate comments for (default: 'warning') */
    minSeverity?: 'error' | 'warning' | 'info';
    /** Maximum number of inline comments (GitHub limit: 60 per review) */
    maxComments?: number;
}
/**
 * Build a markdown comment body for a single ReviewIssue.
 * Includes severity badge, message, suggestion, and optional code suggestion.
 */
export declare function buildIssueCommentBody(issue: ReviewIssue, includeSuggestions: boolean): string;
/**
 * Build a comment body for an unmet spec requirement.
 */
export declare function buildComplianceCommentBody(requirementId: string, requirementDescription: string, explanation: string): string;
/**
 * Generate GitHub review change requests from LLM findings
 *
 * Converts ReviewIssues and spec compliance results into a structured
 * GitHub review with inline comments and an overall verdict.
 *
 * GitHub API usage:
 *   POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
 *   Body: { commit_id, body, event, comments }
 */
export declare function generateChangeRequests(issues: ReviewIssue[], options: ChangeRequestOptions, compliance?: SpecComplianceResult): GitHubReview;
/**
 * Format a list of change requests as a standalone markdown summary
 * (for use in step summaries or PR comment bodies when API isn't available)
 */
export declare function formatChangeRequestsAsMarkdown(review: GitHubReview): string;
//# sourceMappingURL=change-requests.d.ts.map