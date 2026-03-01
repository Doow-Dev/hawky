/**
 * Tests for PR Comment Formatter (S076)
 */

import {
  formatLLMComment,
  generateGitHubLineLink,
  generateLLMStatusBadge,
  LLM_COMMENT_MARKER,
  type LLMCommentOptions,
  type LLMFindings,
} from '../../src/llm/pr-comment-formatter';
import type { LLMReviewResult } from '../../src/llm/review';
import type { SpecComplianceResult } from '../../src/llm/spec-compliance';

// ============================================================================
// Helpers
// ============================================================================

function createDefaultOptions(overrides: Partial<LLMCommentOptions> = {}): LLMCommentOptions {
  return {
    repository: 'the-crux-squad/hawky',
    commitSha: 'abc1234def5678',
    prNumber: 42,
    ...overrides,
  };
}

function createMockReview(overrides: Partial<LLMReviewResult> = {}): LLMReviewResult {
  return {
    issues: [
      {
        file: 'src/auth.ts',
        line: 10,
        severity: 'error',
        message: 'Missing token validation',
        suggestion: 'Add validateToken() call before processing',
        category: 'security',
      },
      {
        file: 'src/api.ts',
        line: 25,
        severity: 'warning',
        message: 'Potential race condition in async handler',
        category: 'performance',
      },
      {
        file: 'src/utils.ts',
        line: 5,
        severity: 'info',
        message: 'Consider extracting this into a utility function',
      },
    ],
    summary: 'Found security concern and one performance warning.',
    confidence: 0.85,
    inputTokens: 500,
    outputTokens: 200,
    cost: 0.008,
    latencyMs: 1200,
    ...overrides,
  };
}

function createMockCompliance(overrides: Partial<SpecComplianceResult> = {}): SpecComplianceResult {
  const requirements = [
    { id: 'AC-1', description: 'Token validation must reject short tokens' },
    { id: 'AC-2', description: 'Auth module must export validateToken' },
  ];

  return {
    complianceScore: 0.5,
    requirementResults: [
      { requirement: requirements[0]!, met: false, confidence: 0.9, explanation: 'No validation found.' },
      { requirement: requirements[1]!, met: true, confidence: 0.95, explanation: 'Export found at line 1.' },
    ],
    metRequirements: [
      { requirement: requirements[1]!, met: true, confidence: 0.95, explanation: 'Export found at line 1.' },
    ],
    missedRequirements: [
      { requirement: requirements[0]!, met: false, confidence: 0.9, explanation: 'No validation found.' },
    ],
    overallConfidence: 0.9,
    summary: '1 of 2 requirements met.',
    inputTokens: 300,
    outputTokens: 100,
    cost: 0.005,
    latencyMs: 800,
    ...overrides,
  };
}

// ============================================================================
// generateGitHubLineLink
// ============================================================================

describe('generateGitHubLineLink', () => {
  it('should generate correct GitHub permalink', () => {
    const link = generateGitHubLineLink(
      'owner/repo',
      'abc1234',
      'src/auth.ts',
      42
    );

    expect(link).toBe('https://github.com/owner/repo/blob/abc1234/src/auth.ts#L42');
  });

  it('should omit line fragment when line is 0', () => {
    const link = generateGitHubLineLink(
      'owner/repo',
      'abc1234',
      'src/auth.ts',
      0
    );

    expect(link).toBe('https://github.com/owner/repo/blob/abc1234/src/auth.ts');
    expect(link).not.toContain('#L');
  });

  it('should return empty string when repository is empty', () => {
    const link = generateGitHubLineLink('', 'abc1234', 'src/auth.ts', 10);
    expect(link).toBe('');
  });

  it('should return empty string when commitSha is empty', () => {
    const link = generateGitHubLineLink('owner/repo', '', 'src/auth.ts', 10);
    expect(link).toBe('');
  });

  it('should return empty string when file is empty', () => {
    const link = generateGitHubLineLink('owner/repo', 'abc1234', '', 10);
    expect(link).toBe('');
  });

  it('should handle nested file paths', () => {
    const link = generateGitHubLineLink(
      'org/repo',
      'deadbeef',
      'src/modules/deep/file.ts',
      100
    );

    expect(link).toContain('/src/modules/deep/file.ts#L100');
  });
});

// ============================================================================
// formatLLMComment
// ============================================================================

describe('formatLLMComment', () => {
  it('should include hidden marker for comment identification', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain(LLM_COMMENT_MARKER);
  });

  it('should include header', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Hawky AI Review');
  });

  it('should count errors, warnings, and infos correctly', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.infoCount).toBe(1);
  });

  it('should mark hasBlockingIssues when errors are present', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.hasBlockingIssues).toBe(true);
  });

  it('should not mark hasBlockingIssues for warnings only', () => {
    const review = createMockReview({
      issues: [{ file: 'src/api.ts', line: 5, severity: 'warning', message: 'Warning only' }],
    });
    const findings: LLMFindings = { review };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.hasBlockingIssues).toBe(false);
  });

  it('should include GitHub line links for issues', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    // Check link format: should link to src/auth.ts:10
    expect(result.body).toContain('the-crux-squad/hawky');
    expect(result.body).toContain('src/auth.ts');
    expect(result.body).toContain('#L10');
  });

  it('should truncate commit SHA in footer to 7 chars', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    // Footer should show 7-char SHA
    expect(result.body).toContain('Commit: `abc1234`');
    // Full SHA may appear in GitHub line links (that's correct behavior)
    // Just verify the footer uses truncated form
    const footerLine = result.body.split('\n').find((l) => l.includes('Commit:'));
    expect(footerLine).toContain('`abc1234`');
    expect(footerLine).not.toContain('abc1234def5678');
  });

  it('should include review summary', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Found security concern and one performance warning.');
  });

  it('should include suggestions inline with issues', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Add validateToken() call before processing');
  });

  it('should show compliance section when provided', () => {
    const findings: LLMFindings = {
      review: createMockReview(),
      compliance: createMockCompliance(),
    };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Spec Compliance');
    expect(result.body).toContain('50%');
    expect(result.body).toContain('AC-1');
  });

  it('should work with compliance only (no review)', () => {
    const findings: LLMFindings = { compliance: createMockCompliance() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Spec Compliance');
    expect(result.errorCount).toBe(0);
    expect(result.hasBlockingIssues).toBe(false);
  });

  it('should include metadata section when requested', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions({ includeMetadata: true }));

    expect(result.body).toContain('Review Metadata');
    expect(result.body).toContain('LLM Confidence');
    expect(result.body).toContain('85%');
    expect(result.body).toContain('Input Tokens');
    expect(result.body).toContain('Cost');
  });

  it('should not include metadata by default', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).not.toContain('Review Metadata');
  });

  it('should respect maxIssuesPerSection limit', () => {
    const manyErrors = Array.from({ length: 10 }, (_, i) => ({
      file: `src/file${i}.ts`,
      line: i + 1,
      severity: 'error' as const,
      message: `Error ${i + 1}`,
    }));

    const findings: LLMFindings = {
      review: createMockReview({ issues: manyErrors }),
    };
    const result = formatLLMComment(findings, createDefaultOptions({ maxIssuesPerSection: 3 }));

    // Should mention overflow
    expect(result.body).toContain('and 7 more');
  });

  it('should show no-issues message for empty review', () => {
    const findings: LLMFindings = {
      review: createMockReview({ issues: [], summary: 'All clear!' }),
    };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('No issues found by LLM review');
    expect(result.errorCount).toBe(0);
  });

  it('should show unmet requirements in compliance section', () => {
    const findings: LLMFindings = { compliance: createMockCompliance() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Unmet Requirements');
    expect(result.body).toContain('No validation found.');
  });

  it('should render collapsible sections with <details>', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions({ includeDetails: true }));

    expect(result.body).toContain('<details');
    expect(result.body).toContain('<summary>');
  });

  it('should categorize issues correctly', () => {
    const findings: LLMFindings = { review: createMockReview() };
    const result = formatLLMComment(findings, createDefaultOptions());

    expect(result.body).toContain('Errors');
    expect(result.body).toContain('Warnings');
    expect(result.body).toContain('Suggestions');
  });
});

// ============================================================================
// generateLLMStatusBadge
// ============================================================================

describe('generateLLMStatusBadge', () => {
  it('should return error badge when errors present', () => {
    const badge = generateLLMStatusBadge({
      body: '',
      errorCount: 2,
      warningCount: 1,
      infoCount: 0,
      hasBlockingIssues: true,
    });

    expect(badge).toContain(':x:');
    expect(badge).toContain('2 error(s)');
  });

  it('should return warning badge when only warnings', () => {
    const badge = generateLLMStatusBadge({
      body: '',
      errorCount: 0,
      warningCount: 3,
      infoCount: 0,
      hasBlockingIssues: false,
    });

    expect(badge).toContain(':warning:');
    expect(badge).toContain('3 warning(s)');
  });

  it('should return success badge when no issues', () => {
    const badge = generateLLMStatusBadge({
      body: '',
      errorCount: 0,
      warningCount: 0,
      infoCount: 2,
      hasBlockingIssues: false,
    });

    expect(badge).toContain(':white_check_mark:');
    expect(badge).toContain('No issues found');
  });
});
