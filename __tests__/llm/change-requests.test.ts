/**
 * Tests for Change Request Generation (S077)
 */

import {
  generateChangeRequests,
  buildIssueCommentBody,
  buildComplianceCommentBody,
  formatChangeRequestsAsMarkdown,
  type ChangeRequestOptions,
  type ReviewComment,
} from '../../src/llm/change-requests';
import type { ReviewIssue } from '../../src/llm/review';
import type { SpecComplianceResult } from '../../src/llm/spec-compliance';

// ============================================================================
// Helpers
// ============================================================================

function createDefaultOptions(overrides: Partial<ChangeRequestOptions> = {}): ChangeRequestOptions {
  return {
    repository: 'owner/repo',
    commitSha: 'abc1234',
    includeSuggestions: false,
    ...overrides,
  };
}

function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'src/auth.ts',
    line: 10,
    severity: 'error',
    message: 'Missing token validation',
    suggestion: 'Add validateToken() before processing',
    category: 'security',
    ...overrides,
  };
}

function createMockCompliance(allMet = false): SpecComplianceResult {
  const requirements = [
    { id: 'AC-1', description: 'Token validation must work' },
    { id: 'AC-2', description: 'Errors must include codes' },
  ];

  if (allMet) {
    const allMetResults = requirements.map((req) => ({
      requirement: req,
      met: true,
      confidence: 0.9,
      explanation: 'Met.',
    }));
    return {
      complianceScore: 1,
      requirementResults: allMetResults,
      metRequirements: allMetResults,
      missedRequirements: [],
      overallConfidence: 0.9,
      summary: 'All requirements met.',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
      latencyMs: 200,
    };
  }

  return {
    complianceScore: 0.5,
    requirementResults: [
      { requirement: requirements[0]!, met: false, confidence: 0.9, explanation: 'Missing.' },
      { requirement: requirements[1]!, met: true, confidence: 0.85, explanation: 'Present.' },
    ],
    metRequirements: [
      { requirement: requirements[1]!, met: true, confidence: 0.85, explanation: 'Present.' },
    ],
    missedRequirements: [
      { requirement: requirements[0]!, met: false, confidence: 0.9, explanation: 'Missing.' },
    ],
    overallConfidence: 0.9,
    summary: '1 of 2 met.',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
    latencyMs: 200,
  };
}

// ============================================================================
// buildIssueCommentBody
// ============================================================================

describe('buildIssueCommentBody', () => {
  it('should include severity badge for error', () => {
    const issue = createIssue({ severity: 'error' });
    const body = buildIssueCommentBody(issue, false);

    expect(body).toContain(':red_circle:');
    expect(body).toContain('**Error**');
    expect(body).toContain('Missing token validation');
  });

  it('should include severity badge for warning', () => {
    const issue = createIssue({ severity: 'warning', suggestion: undefined });
    const body = buildIssueCommentBody(issue, false);

    expect(body).toContain(':yellow_circle:');
    expect(body).toContain('**Warning**');
  });

  it('should include severity badge for info', () => {
    const issue = createIssue({ severity: 'info', suggestion: undefined });
    const body = buildIssueCommentBody(issue, false);

    expect(body).toContain(':blue_circle:');
    expect(body).toContain('**Suggestion**');
  });

  it('should format suggestion as plain text when includeSuggestions=false', () => {
    const issue = createIssue({ suggestion: 'Use validateToken()' });
    const body = buildIssueCommentBody(issue, false);

    expect(body).toContain('**Suggestion:** Use validateToken()');
    expect(body).not.toContain('```suggestion');
  });

  it('should format suggestion as GitHub code suggestion block when includeSuggestions=true', () => {
    const issue = createIssue({ suggestion: 'const result = validateToken(token);' });
    const body = buildIssueCommentBody(issue, true);

    expect(body).toContain('```suggestion');
    expect(body).toContain('const result = validateToken(token);');
    expect(body).toContain('```');
  });

  it('should include category when present', () => {
    const issue = createIssue({ category: 'security' });
    const body = buildIssueCommentBody(issue, false);

    expect(body).toContain('`security`');
  });

  it('should not include category section when absent', () => {
    const issue = createIssue({ category: undefined });
    const body = buildIssueCommentBody(issue, false);

    expect(body).not.toContain('Category:');
  });

  it('should not include suggestion section when absent', () => {
    const issue = createIssue({ suggestion: undefined });
    const body = buildIssueCommentBody(issue, false);

    expect(body).not.toContain('Suggestion:');
    expect(body).not.toContain('```suggestion');
  });
});

// ============================================================================
// buildComplianceCommentBody
// ============================================================================

describe('buildComplianceCommentBody', () => {
  it('should include requirement ID and description', () => {
    const body = buildComplianceCommentBody(
      'AC-1',
      'Token validation must reject short tokens',
      'Function returns boolean without checking length'
    );

    expect(body).toContain('[AC-1]');
    expect(body).toContain('Token validation must reject short tokens');
  });

  it('should include the explanation', () => {
    const body = buildComplianceCommentBody('AC-2', 'Must export validateToken', 'No export found');

    expect(body).toContain('No export found');
  });

  it('should indicate changes are required', () => {
    const body = buildComplianceCommentBody('AC-1', 'Req', 'Explanation');

    expect(body).toContain('must be implemented');
  });
});

// ============================================================================
// generateChangeRequests
// ============================================================================

describe('generateChangeRequests', () => {
  it('should return APPROVE when no issues and no unmet requirements', () => {
    const review = generateChangeRequests([], createDefaultOptions());

    expect(review.event).toBe('APPROVE');
    expect(review.comments).toHaveLength(0);
  });

  it('should return REQUEST_CHANGES when errors are present', () => {
    const issues = [createIssue({ severity: 'error' })];
    const review = generateChangeRequests(issues, createDefaultOptions());

    expect(review.event).toBe('REQUEST_CHANGES');
  });

  it('should return REQUEST_CHANGES when compliance has missed requirements', () => {
    const review = generateChangeRequests([], createDefaultOptions(), createMockCompliance());

    expect(review.event).toBe('REQUEST_CHANGES');
  });

  it('should return COMMENT when only warnings', () => {
    const issues = [createIssue({ severity: 'warning', suggestion: undefined })];
    const review = generateChangeRequests(issues, createDefaultOptions());

    expect(review.event).toBe('COMMENT');
  });

  it('should generate inline comment for issue with valid line number', () => {
    const issues = [createIssue({ file: 'src/auth.ts', line: 10 })];
    const review = generateChangeRequests(issues, createDefaultOptions());

    expect(review.comments).toHaveLength(1);
    const comment = review.comments[0] as ReviewComment;
    expect(comment.path).toBe('src/auth.ts');
    expect(comment.line).toBe(10);
    expect(comment.side).toBe('RIGHT');
  });

  it('should skip inline comment for issue with line 0', () => {
    const issues = [
      createIssue({ line: 0 }),
      createIssue({ file: 'src/other.ts', line: 5 }),
    ];
    const review = generateChangeRequests(issues, createDefaultOptions());

    // Only the second issue (line 5) gets a comment
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]?.path).toBe('src/other.ts');
  });

  it('should filter issues by minSeverity: error only', () => {
    const issues = [
      createIssue({ severity: 'error', file: 'src/a.ts', line: 1 }),
      createIssue({ severity: 'warning', file: 'src/b.ts', line: 2, suggestion: undefined }),
      createIssue({ severity: 'info', file: 'src/c.ts', line: 3, suggestion: undefined }),
    ];

    const review = generateChangeRequests(
      issues,
      createDefaultOptions({ minSeverity: 'error' })
    );

    // Only error-level inline comments
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0]?.path).toBe('src/a.ts');
  });

  it('should include all severities when minSeverity is info', () => {
    const issues = [
      createIssue({ severity: 'error', file: 'src/a.ts', line: 1 }),
      createIssue({ severity: 'warning', file: 'src/b.ts', line: 2, suggestion: undefined }),
      createIssue({ severity: 'info', file: 'src/c.ts', line: 3, suggestion: undefined }),
    ];

    const review = generateChangeRequests(
      issues,
      createDefaultOptions({ minSeverity: 'info' })
    );

    expect(review.comments).toHaveLength(3);
  });

  it('should cap comments at maxComments', () => {
    const manyIssues = Array.from({ length: 20 }, (_, i) =>
      createIssue({ file: `src/file${i}.ts`, line: i + 1 })
    );

    const review = generateChangeRequests(
      manyIssues,
      createDefaultOptions({ maxComments: 5 })
    );

    expect(review.comments).toHaveLength(5);
  });

  it('should cap comments at GitHub maximum of 60', () => {
    const manyIssues = Array.from({ length: 100 }, (_, i) =>
      createIssue({ file: `src/file${i}.ts`, line: i + 1 })
    );

    const review = generateChangeRequests(
      manyIssues,
      createDefaultOptions({ maxComments: 100 })
    );

    expect(review.comments.length).toBeLessThanOrEqual(60);
  });

  it('should sort errors before warnings in comments', () => {
    const issues = [
      createIssue({ severity: 'warning', file: 'src/warn.ts', line: 1, suggestion: undefined }),
      createIssue({ severity: 'error', file: 'src/err.ts', line: 2 }),
    ];

    const review = generateChangeRequests(
      issues,
      createDefaultOptions({ minSeverity: 'info' })
    );

    // Errors first
    expect(review.comments[0]?.path).toBe('src/err.ts');
    expect(review.comments[1]?.path).toBe('src/warn.ts');
  });

  it('should include code suggestion blocks when includeSuggestions=true', () => {
    const issues = [createIssue({ suggestion: 'validateToken(token);' })];
    const review = generateChangeRequests(
      issues,
      createDefaultOptions({ includeSuggestions: true })
    );

    expect(review.comments[0]?.body).toContain('```suggestion');
  });

  it('should include review summary in body', () => {
    const issues = [createIssue({ severity: 'error' })];
    const review = generateChangeRequests(issues, createDefaultOptions());

    expect(review.body).toContain('Hawky AI Review');
    expect(review.body).toContain('1 error(s)');
  });

  it('should include unmet requirements in review body', () => {
    const review = generateChangeRequests([], createDefaultOptions(), createMockCompliance());

    expect(review.body).toContain('Unmet Spec Requirements');
    expect(review.body).toContain('AC-1');
  });

  it('should produce APPROVE with success message for clean review', () => {
    const review = generateChangeRequests([], createDefaultOptions(), createMockCompliance(true));

    expect(review.event).toBe('APPROVE');
    expect(review.body).toContain('No issues found');
  });
});

// ============================================================================
// formatChangeRequestsAsMarkdown
// ============================================================================

describe('formatChangeRequestsAsMarkdown', () => {
  it('should include review body', () => {
    const review = generateChangeRequests(
      [createIssue()],
      createDefaultOptions()
    );
    const markdown = formatChangeRequestsAsMarkdown(review);

    expect(markdown).toContain('Hawky AI Review');
  });

  it('should include inline comments section', () => {
    const review = generateChangeRequests(
      [createIssue()],
      createDefaultOptions()
    );
    const markdown = formatChangeRequestsAsMarkdown(review);

    expect(markdown).toContain('Inline Comments');
    expect(markdown).toContain('src/auth.ts:10');
  });

  it('should omit inline comments section when no comments', () => {
    const review = generateChangeRequests([], createDefaultOptions());
    const markdown = formatChangeRequestsAsMarkdown(review);

    expect(markdown).not.toContain('Inline Comments');
  });
});
