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

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  blockThreshold: 0.7,
  warnThreshold: 0.5,
  reviewThreshold: 0.4,
};

// ============================================================================
// Config Parsing
// ============================================================================

/**
 * Parse confidence configuration from .hawky.yml LLM section
 */
export function parseConfidenceConfig(
  config: LLMConfidenceConfig
): ConfidenceThresholds {
  const defaults = DEFAULT_CONFIDENCE_THRESHOLDS;

  return {
    blockThreshold: clampThreshold(
      config.confidence_threshold ?? defaults.blockThreshold
    ),
    warnThreshold: clampThreshold(
      config.warn_threshold ?? defaults.warnThreshold
    ),
    reviewThreshold: clampThreshold(
      config.review_threshold ?? defaults.reviewThreshold
    ),
  };
}

function clampThreshold(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// Per-Issue Confidence Assignment
// ============================================================================

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
export function deriveIssueConfidence(
  issue: ReviewIssue,
  overallConfidence: number
): number {
  let confidence = overallConfidence;

  // Issues with suggestions tend to be more concrete → slightly higher confidence
  if (issue.suggestion) {
    confidence = Math.min(1, confidence + 0.05);
  }

  // Errors reported at low severity → slight reduction (LLM might be over-sensitive)
  if (issue.severity === 'error' && overallConfidence < 0.6) {
    confidence = Math.max(0, confidence - 0.05);
  }

  // Info issues at high severity → high confidence (LLM was decisive about low severity)
  if (issue.severity === 'info' && overallConfidence > 0.8) {
    confidence = Math.min(1, confidence + 0.05);
  }

  return Math.max(0, Math.min(1, confidence));
}

// ============================================================================
// Scoring Logic
// ============================================================================

/**
 * Score a single issue against confidence thresholds
 */
export function scoreIssue(
  issue: ReviewIssue,
  issueConfidence: number,
  thresholds: ConfidenceThresholds,
  reviewIsReliable: boolean
): ScoredIssue {
  if (!reviewIsReliable) {
    // Entire review is unreliable — demote everything to info
    return {
      issue,
      confidence: issueConfidence,
      effectiveSeverity: 'info',
      isBlocking: false,
      demoReason: 'Overall review confidence is too low — entire review is informational only',
    };
  }

  if (issueConfidence >= thresholds.blockThreshold) {
    // High confidence — keep original severity, may block
    return {
      issue,
      confidence: issueConfidence,
      effectiveSeverity: issue.severity,
      isBlocking: issue.severity === 'error',
    };
  }

  if (issueConfidence >= thresholds.warnThreshold) {
    // Medium confidence — demote errors to warnings
    const demoted = issue.severity === 'error';
    return {
      issue,
      confidence: issueConfidence,
      effectiveSeverity: demoted ? 'warning' : issue.severity,
      isBlocking: false,
      ...(demoted
        ? {
          demoReason: `Confidence ${Math.round(issueConfidence * 100)}% is below block threshold ${Math.round(thresholds.blockThreshold * 100)}% — demoted to warning`,
        }
        : {}),
    };
  }

  // Low confidence — demote to info
  return {
    issue,
    confidence: issueConfidence,
    effectiveSeverity: 'info',
    isBlocking: false,
    demoReason: `Confidence ${Math.round(issueConfidence * 100)}% is below warn threshold ${Math.round(thresholds.warnThreshold * 100)}% — demoted to suggestion`,
  };
}

/**
 * Score all issues in an LLM review result
 *
 * Applies confidence thresholds to determine:
 * - Which issues can block the PR
 * - Which issues are warnings (non-blocking but visible)
 * - Which issues are informational only
 */
export function scoreReview(
  result: LLMReviewResult,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS
): ScoredReview {
  const overallConfidence = result.confidence;
  const isReliable = overallConfidence >= thresholds.reviewThreshold;

  const scoredIssues: ScoredIssue[] = result.issues.map((issue) => {
    const issueConfidence = deriveIssueConfidence(issue, overallConfidence);
    return scoreIssue(issue, issueConfidence, thresholds, isReliable);
  });

  const blockingIssues = scoredIssues.filter((s) => s.isBlocking);
  const warnIssues = scoredIssues.filter(
    (s) => !s.isBlocking && s.effectiveSeverity === 'warning'
  );
  const infoIssues = scoredIssues.filter((s) => s.effectiveSeverity === 'info');
  const demotedCount = scoredIssues.filter((s) => s.demoReason !== undefined).length;

  return {
    issues: scoredIssues,
    blockingIssues,
    warnIssues,
    infoIssues,
    overallConfidence,
    isReliable,
    thresholds,
    demotedCount,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a confidence score as a human-readable label
 */
export function formatConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'Very High';
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.5) return 'Medium';
  if (confidence >= 0.3) return 'Low';
  return 'Very Low';
}

/**
 * Generate a markdown confidence note for inclusion in PR comments
 */
export function formatConfidenceNote(scored: ScoredReview): string {
  const pct = Math.round(scored.overallConfidence * 100);
  const label = formatConfidenceLabel(scored.overallConfidence);
  const lines: string[] = [];

  if (!scored.isReliable) {
    lines.push(
      `:warning: **LLM Confidence: ${pct}% (${label})** — Review confidence is low. ` +
      `All findings are informational only and will NOT block the PR.`
    );
    return lines.join('\n');
  }

  lines.push(`:brain: **LLM Confidence: ${pct}% (${label})**`);

  if (scored.demotedCount > 0) {
    lines.push(
      `*${scored.demotedCount} finding(s) were demoted to non-blocking due to low confidence.*`
    );
  }

  const thresholdInfo = [
    `Block threshold: ${Math.round(scored.thresholds.blockThreshold * 100)}%`,
    `Warn threshold: ${Math.round(scored.thresholds.warnThreshold * 100)}%`,
  ].join(' | ');

  lines.push(`*Thresholds: ${thresholdInfo}*`);

  return lines.join('\n');
}
