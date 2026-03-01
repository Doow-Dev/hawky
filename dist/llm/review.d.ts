/**
 * Semantic Review Engine
 *
 * Core LLM review that produces structured output.
 * Uses the assembled context to generate code review feedback.
 */
import type { LLMClient } from './provider';
import type { ReviewContext } from './context';
/**
 * Severity of a review issue
 */
export type ReviewSeverity = 'error' | 'warning' | 'info';
/**
 * A single issue found by the LLM review
 */
export interface ReviewIssue {
    /** File path where issue was found */
    file: string;
    /** Line number (1-indexed, 0 if unknown) */
    line: number;
    /** Issue severity */
    severity: ReviewSeverity;
    /** Human-readable message */
    message: string;
    /** Suggested fix (if available) */
    suggestion?: string;
    /** Category of the issue */
    category?: string;
}
/**
 * Result of LLM review
 */
export interface LLMReviewResult {
    /** All issues found */
    issues: ReviewIssue[];
    /** Overall summary of the review */
    summary: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Token usage */
    inputTokens: number;
    outputTokens: number;
    /** Cost in USD */
    cost: number;
    /** Latency in ms */
    latencyMs: number;
    /** Raw LLM response (for debugging) */
    rawResponse?: string;
}
/**
 * Options for the review
 */
export interface ReviewOptions {
    /** LLM client to use */
    client: LLMClient;
    /** Assembled context */
    context: ReviewContext;
    /** Focus areas for the review */
    focusAreas?: string[];
    /** Maximum issues to return */
    maxIssues?: number;
    /** Include raw response in result */
    includeRawResponse?: boolean;
}
/**
 * Parse LLM response into structured result
 */
export declare function parseReviewResponse(response: string): {
    issues: ReviewIssue[];
    summary: string;
    confidence: number;
};
/**
 * Run LLM code review
 */
export declare function runReview(options: ReviewOptions): Promise<LLMReviewResult>;
/**
 * Format review result as markdown
 */
export declare function formatReviewAsMarkdown(result: LLMReviewResult): string;
/**
 * Convert review issues to gate violations
 */
export declare function reviewIssuesToViolations(issues: ReviewIssue[], gate: 'llm-review'): Array<{
    ruleId: string;
    file: string;
    line: number;
    message: string;
    gate: string;
    severity: 'error' | 'warning';
}>;
//# sourceMappingURL=review.d.ts.map