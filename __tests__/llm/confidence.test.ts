/**
 * Tests for Review Confidence Scoring (S079)
 */

import {
  scoreReview,
  scoreIssue,
  deriveIssueConfidence,
  parseConfidenceConfig,
  formatConfidenceLabel,
  formatConfidenceNote,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type ConfidenceThresholds,
  type ScoredReview,
} from '../../src/llm/confidence';
import type { ReviewIssue, LLMReviewResult } from '../../src/llm/review';

// ============================================================================
// Helpers
// ============================================================================

function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'src/auth.ts',
    line: 10,
    severity: 'error',
    message: 'Missing validation',
    ...overrides,
  };
}

function createReviewResult(
  issues: ReviewIssue[],
  confidence: number
): LLMReviewResult {
  return {
    issues,
    summary: 'Test review',
    confidence,
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
    latencyMs: 500,
  };
}

const HIGH_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  blockThreshold: 0.7,
  warnThreshold: 0.5,
  reviewThreshold: 0.4,
};

// ============================================================================
// parseConfidenceConfig
// ============================================================================

describe('parseConfidenceConfig', () => {
  it('should return defaults for empty config', () => {
    const thresholds = parseConfidenceConfig({});

    expect(thresholds.blockThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLDS.blockThreshold);
    expect(thresholds.warnThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLDS.warnThreshold);
    expect(thresholds.reviewThreshold).toBe(DEFAULT_CONFIDENCE_THRESHOLDS.reviewThreshold);
  });

  it('should parse custom block threshold', () => {
    const thresholds = parseConfidenceConfig({ confidence_threshold: 0.8 });

    expect(thresholds.blockThreshold).toBe(0.8);
  });

  it('should parse custom warn threshold', () => {
    const thresholds = parseConfidenceConfig({ warn_threshold: 0.4 });

    expect(thresholds.warnThreshold).toBe(0.4);
  });

  it('should parse custom review threshold', () => {
    const thresholds = parseConfidenceConfig({ review_threshold: 0.3 });

    expect(thresholds.reviewThreshold).toBe(0.3);
  });

  it('should clamp values to 0-1 range', () => {
    const thresholds = parseConfidenceConfig({
      confidence_threshold: 1.5,
      warn_threshold: -0.1,
    });

    expect(thresholds.blockThreshold).toBe(1);
    expect(thresholds.warnThreshold).toBe(0);
  });
});

// ============================================================================
// deriveIssueConfidence
// ============================================================================

describe('deriveIssueConfidence', () => {
  it('should base on overall confidence', () => {
    const issue = createIssue({ severity: 'warning' });
    const confidence = deriveIssueConfidence(issue, 0.8);

    // Should be close to 0.8 (with minor adjustments)
    expect(confidence).toBeGreaterThanOrEqual(0.7);
    expect(confidence).toBeLessThanOrEqual(0.95);
  });

  it('should boost confidence when issue has a suggestion', () => {
    const issueWithSuggestion = createIssue({ severity: 'warning', suggestion: 'Use x instead' });
    const issueWithout = createIssue({ severity: 'warning' });

    const withSuggestion = deriveIssueConfidence(issueWithSuggestion, 0.8);
    const without = deriveIssueConfidence(issueWithout, 0.8);

    expect(withSuggestion).toBeGreaterThan(without);
  });

  it('should slightly reduce confidence for error at low overall confidence', () => {
    const errorIssue = createIssue({ severity: 'error' });
    const warningIssue = createIssue({ severity: 'warning' });

    const errorConf = deriveIssueConfidence(errorIssue, 0.5);
    const warningConf = deriveIssueConfidence(warningIssue, 0.5);

    expect(errorConf).toBeLessThan(warningConf);
  });

  it('should clamp output to 0-1 range', () => {
    const issue = createIssue({ suggestion: 'fix' });

    const high = deriveIssueConfidence(issue, 1.0);
    const low = deriveIssueConfidence(issue, 0.0);

    expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// scoreIssue
// ============================================================================

describe('scoreIssue', () => {
  const thresholds = HIGH_CONFIDENCE_THRESHOLDS;

  it('should keep error severity for high-confidence error issue', () => {
    const issue = createIssue({ severity: 'error' });
    const scored = scoreIssue(issue, 0.85, thresholds, true);

    expect(scored.effectiveSeverity).toBe('error');
    expect(scored.isBlocking).toBe(true);
    expect(scored.demoReason).toBeUndefined();
  });

  it('should keep warning severity for high-confidence warning issue', () => {
    const issue = createIssue({ severity: 'warning' });
    const scored = scoreIssue(issue, 0.85, thresholds, true);

    expect(scored.effectiveSeverity).toBe('warning');
    expect(scored.isBlocking).toBe(false);
  });

  it('should demote error to warning at medium confidence', () => {
    const issue = createIssue({ severity: 'error' });
    const scored = scoreIssue(issue, 0.6, thresholds, true); // below blockThreshold (0.7), above warnThreshold (0.5)

    expect(scored.effectiveSeverity).toBe('warning');
    expect(scored.isBlocking).toBe(false);
    expect(scored.demoReason).toContain('demoted to warning');
  });

  it('should keep warning as warning at medium confidence', () => {
    const issue = createIssue({ severity: 'warning' });
    const scored = scoreIssue(issue, 0.6, thresholds, true);

    expect(scored.effectiveSeverity).toBe('warning');
    expect(scored.isBlocking).toBe(false);
    expect(scored.demoReason).toBeUndefined();
  });

  it('should demote to info at low confidence', () => {
    const issue = createIssue({ severity: 'error' });
    const scored = scoreIssue(issue, 0.3, thresholds, true); // below warnThreshold (0.5)

    expect(scored.effectiveSeverity).toBe('info');
    expect(scored.isBlocking).toBe(false);
    expect(scored.demoReason).toContain('demoted to suggestion');
  });

  it('should demote everything to info when review is unreliable', () => {
    const errorIssue = createIssue({ severity: 'error' });
    const scored = scoreIssue(errorIssue, 0.9, thresholds, false); // unreliable review

    expect(scored.effectiveSeverity).toBe('info');
    expect(scored.isBlocking).toBe(false);
    expect(scored.demoReason).toContain('confidence is too low');
  });

  it('should preserve original issue reference', () => {
    const issue = createIssue({ message: 'Test message' });
    const scored = scoreIssue(issue, 0.8, thresholds, true);

    expect(scored.issue).toBe(issue);
    expect(scored.confidence).toBe(0.8);
  });
});

// ============================================================================
// scoreReview
// ============================================================================

describe('scoreReview', () => {
  it('should mark review as reliable when confidence >= reviewThreshold', () => {
    const result = createReviewResult([createIssue()], 0.8);
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.isReliable).toBe(true);
  });

  it('should mark review as unreliable when confidence < reviewThreshold', () => {
    const result = createReviewResult([createIssue()], 0.3); // below 0.4 reviewThreshold
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.isReliable).toBe(false);
  });

  it('should categorize blocking issues correctly', () => {
    const issues = [
      createIssue({ severity: 'error', file: 'src/a.ts' }),
      createIssue({ severity: 'warning', file: 'src/b.ts' }),
      createIssue({ severity: 'info', file: 'src/c.ts' }),
    ];

    const result = createReviewResult(issues, 0.9); // High confidence
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.blockingIssues).toHaveLength(1);
    expect(scored.blockingIssues[0]?.issue.file).toBe('src/a.ts');
  });

  it('should categorize warn issues correctly', () => {
    const issues = [
      createIssue({ severity: 'warning', file: 'src/warn.ts' }),
    ];

    const result = createReviewResult(issues, 0.9);
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.warnIssues).toHaveLength(1);
  });

  it('should count demoted issues', () => {
    const issues = [
      createIssue({ severity: 'error', file: 'src/a.ts' }), // Will be demoted at low confidence
    ];

    const result = createReviewResult(issues, 0.5); // Medium confidence — error demoted to warning
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.demotedCount).toBeGreaterThan(0);
  });

  it('should have no blocking issues when review is unreliable', () => {
    const issues = [
      createIssue({ severity: 'error' }),
      createIssue({ severity: 'error', file: 'src/b.ts' }),
    ];

    const result = createReviewResult(issues, 0.2); // Very low confidence
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.blockingIssues).toHaveLength(0);
    expect(scored.isReliable).toBe(false);
  });

  it('should handle empty issues array', () => {
    const result = createReviewResult([], 0.8);
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.issues).toHaveLength(0);
    expect(scored.blockingIssues).toHaveLength(0);
    expect(scored.warnIssues).toHaveLength(0);
    expect(scored.infoIssues).toHaveLength(0);
    expect(scored.demotedCount).toBe(0);
  });

  it('should use default thresholds when not provided', () => {
    const result = createReviewResult([createIssue()], 0.8);
    const scored = scoreReview(result);

    expect(scored.thresholds).toEqual(DEFAULT_CONFIDENCE_THRESHOLDS);
  });

  it('should record overall confidence', () => {
    const result = createReviewResult([], 0.75);
    const scored = scoreReview(result, HIGH_CONFIDENCE_THRESHOLDS);

    expect(scored.overallConfidence).toBe(0.75);
  });

  it('should respect custom blockThreshold from config', () => {
    // Set very high threshold (0.95) — even high-confidence (0.9) errors get demoted
    const strictThresholds: ConfidenceThresholds = {
      blockThreshold: 0.95,
      warnThreshold: 0.5,
      reviewThreshold: 0.4,
    };

    const issues = [createIssue({ severity: 'error' })];
    const result = createReviewResult(issues, 0.9);
    const scored = scoreReview(result, strictThresholds);

    // Should be demoted to warning since 0.9 < blockThreshold 0.95
    expect(scored.blockingIssues).toHaveLength(0);
    expect(scored.demotedCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// formatConfidenceLabel
// ============================================================================

describe('formatConfidenceLabel', () => {
  it('should label 0.9+ as Very High', () => {
    expect(formatConfidenceLabel(0.95)).toBe('Very High');
    expect(formatConfidenceLabel(0.9)).toBe('Very High');
  });

  it('should label 0.7-0.89 as High', () => {
    expect(formatConfidenceLabel(0.8)).toBe('High');
    expect(formatConfidenceLabel(0.7)).toBe('High');
  });

  it('should label 0.5-0.69 as Medium', () => {
    expect(formatConfidenceLabel(0.6)).toBe('Medium');
    expect(formatConfidenceLabel(0.5)).toBe('Medium');
  });

  it('should label 0.3-0.49 as Low', () => {
    expect(formatConfidenceLabel(0.4)).toBe('Low');
    expect(formatConfidenceLabel(0.3)).toBe('Low');
  });

  it('should label below 0.3 as Very Low', () => {
    expect(formatConfidenceLabel(0.2)).toBe('Very Low');
    expect(formatConfidenceLabel(0)).toBe('Very Low');
  });
});

// ============================================================================
// formatConfidenceNote
// ============================================================================

describe('formatConfidenceNote', () => {
  function buildScoredReview(overrides: Partial<ScoredReview> = {}): ScoredReview {
    return {
      issues: [],
      blockingIssues: [],
      warnIssues: [],
      infoIssues: [],
      overallConfidence: 0.8,
      isReliable: true,
      thresholds: HIGH_CONFIDENCE_THRESHOLDS,
      demotedCount: 0,
      ...overrides,
    };
  }

  it('should include confidence percentage', () => {
    const note = formatConfidenceNote(buildScoredReview({ overallConfidence: 0.85 }));

    expect(note).toContain('85%');
  });

  it('should include confidence label', () => {
    const note = formatConfidenceNote(buildScoredReview({ overallConfidence: 0.85 }));

    expect(note).toContain('High');
  });

  it('should warn when review is unreliable', () => {
    const note = formatConfidenceNote(
      buildScoredReview({ overallConfidence: 0.3, isReliable: false })
    );

    expect(note).toContain('will NOT block');
    expect(note).toContain(':warning:');
  });

  it('should mention demoted findings count', () => {
    const note = formatConfidenceNote(
      buildScoredReview({ demotedCount: 2, isReliable: true })
    );

    expect(note).toContain('2 finding(s) were demoted');
  });

  it('should include threshold info', () => {
    const note = formatConfidenceNote(buildScoredReview());

    expect(note).toContain('Block threshold');
    expect(note).toContain('Warn threshold');
    expect(note).toContain('70%');
    expect(note).toContain('50%');
  });

  it('should not mention demotions when demotedCount is 0', () => {
    const note = formatConfidenceNote(buildScoredReview({ demotedCount: 0 }));

    expect(note).not.toContain('were demoted');
  });
});
