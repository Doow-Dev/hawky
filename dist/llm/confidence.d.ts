/**
 * Review Confidence Scoring (S079)
 *
 * LLM reports confidence for each finding.
 * Low-confidence findings are demoted to WARN tier (non-blocking).
 * Threshold is configurable in .hawky.yml via llm.confidence_threshold.
 *
 * Design:
 * - Each ReviewIssue carries a per-issue confidence (from LLM response)
 * - Issues above blockThreshold → retain severity (can be BLOCK)
 * - Issues below blockThreshold → demote to 'warning' (WARN, never BLOCK)
 * - Issues below warnThreshold → demote to 'info' (informational only)
 * - Overall review confidence filters out unreliable reviews entirely
 */
import type { ReviewIssue } from './review';
import type { LLMReviewResult } from './review';
/**
 * Confidence thresholds for the LLM review
 */
export interface ConfidenceThresholds {
    /**
     * Issues at or above this confidence retain their original severity.
     * Issues below are demoted to 'warning'.
     * Default: 0.7
     */
    blockThreshold: number;
    /**
     * Issues below this confidence are demoted to 'info' (non-blocking suggestion).
     * Default: 0.5
     */
    warnThreshold: number;
    /**
     * If the overall review confidence falls below this, the entire review
     * is marked as unreliable and no issues are treated as blocking.
     * Default: 0.4
     */
    reviewThreshold: number;
}
/**
 * A review issue with an explicit per-issue confidence score attached.
 * This extends ReviewIssue with confidence metadata for scoring.
 */
export interface ScoredIssue {
    /** The original issue */
    issue: ReviewIssue;
    /** Per-issue confidence (0-1) from the LLM */
    confidence: number;
    /**
     * Effective severity after confidence scoring:
     * - If confidence >= blockThreshold: original severity
     * - If confidence >= warnThreshold: 'warning' (demoted)
     * - Otherwise: 'info' (informational only)
     */
    effectiveSeverity: 'error' | 'warning' | 'info';
    /** Whether this issue can block the PR */
    isBlocking: boolean;
    /** Why the severity was demoted (if applicable) */
    demoReason?: string;
}
/**
 * Result of scoring a complete LLM review
 */
export interface ScoredReview {
    /** All scored issues */
    issues: ScoredIssue[];
    /** Issues that can block the PR (high confidence errors) */
    blockingIssues: ScoredIssue[];
    /** Issues that are warnings (medium confidence or demoted) */
    warnIssues: ScoredIssue[];
    /** Issues that are informational only (low confidence) */
    infoIssues: ScoredIssue[];
    /** Overall review confidence (0-1) */
    overallConfidence: number;
    /**
     * Whether the entire review is reliable.
     * If false, no issues are treated as blocking regardless of severity.
     */
    isReliable: boolean;
    /** Thresholds used for scoring */
    thresholds: ConfidenceThresholds;
    /** Number of issues that were demoted due to low confidence */
    demotedCount: number;
}
/**
 * Configuration for LLM confidence (from .hawky.yml)
 */
export interface LLMConfidenceConfig {
    /**
     * Minimum confidence for an issue to block the PR.
     * Maps to blockThreshold. Default: 0.7
     */
    confidence_threshold?: number;
    /**
     * Minimum confidence for an issue to appear as warning.
     * Maps to warnThreshold. Default: 0.5
     */
    warn_threshold?: number;
    /**
     * Minimum overall review confidence to trust the review at all.
     * Maps to reviewThreshold. Default: 0.4
     */
    review_threshold?: number;
}
export declare const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds;
/**
 * Parse confidence configuration from .hawky.yml LLM section
 */
export declare function parseConfidenceConfig(config: LLMConfidenceConfig): ConfidenceThresholds;
/**
 * Extract per-issue confidence from LLM response.
 *
 * The LLM review result has an overall confidence score.
 * Individual issues don't have per-issue confidence in the current schema,
 * so we derive a per-issue confidence based on:
 * 1. The overall review confidence (base)
 * 2. Issue severity (errors reported by LLM get slightly higher confidence weight)
 * 3. Whether the issue has a suggestion (suggests LLM was more certain)
 *
 * For future: per-issue confidence could be added to the LLM prompt output.
 */
export declare function deriveIssueConfidence(issue: ReviewIssue, overallConfidence: number): number;
/**
 * Score a single issue against confidence thresholds
 */
export declare function scoreIssue(issue: ReviewIssue, issueConfidence: number, thresholds: ConfidenceThresholds, reviewIsReliable: boolean): ScoredIssue;
/**
 * Score all issues in an LLM review result
 *
 * Applies confidence thresholds to determine:
 * - Which issues can block the PR
 * - Which issues are warnings (non-blocking but visible)
 * - Which issues are informational only
 */
export declare function scoreReview(result: LLMReviewResult, thresholds?: ConfidenceThresholds): ScoredReview;
/**
 * Format a confidence score as a human-readable label
 */
export declare function formatConfidenceLabel(confidence: number): string;
/**
 * Generate a markdown confidence note for inclusion in PR comments
 */
export declare function formatConfidenceNote(scored: ScoredReview): string;
//# sourceMappingURL=confidence.d.ts.map