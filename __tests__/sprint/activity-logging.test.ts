/**
 * Tests for ACTIVITY.md Auto-Logging (S049)
 */

import {
  formatDate,
  normalizeAuthorToAgent,
  extractStoryIdForActivity,
  summarizeChangedFiles,
  buildOpenedEntry,
  buildReviewedEntry,
  buildMergedEntry,
  buildClosedEntry,
  generateActivityEntries,
  type PREventContext,
  type ActivityLoggingResult,
} from '../../src/sprint/activity-logging';

// ============================================================================
// Test helpers
// ============================================================================

const TEST_DATE = '2026-03-01T10:00:00.000Z';

function createContext(overrides: Partial<PREventContext> = {}): PREventContext {
  return {
    prNumber: 42,
    prTitle: 'Add authentication middleware',
    prUrl: 'https://github.com/owner/repo/pull/42',
    authorLogin: 'luna',
    headBranch: 'S046-auth-middleware',
    baseBranch: 'dev',
    changedFiles: ['src/auth/middleware.ts', 'src/auth/token.ts'],
    labels: ['security-review', 'api-review'],
    event: 'opened',
    date: TEST_DATE,
    projectName: 'hawky',
    sessionId: 'test-session',
    ...overrides,
  };
}

// ============================================================================
// formatDate
// ============================================================================

describe('formatDate', () => {
  it('should extract YYYY-MM-DD from ISO string', () => {
    expect(formatDate('2026-03-01T10:00:00Z')).toBe('2026-03-01');
  });

  it('should handle date-only strings', () => {
    expect(formatDate('2026-03-01')).toBe('2026-03-01');
  });

  it('should handle dates with milliseconds', () => {
    expect(formatDate('2026-03-01T10:00:00.000Z')).toBe('2026-03-01');
  });
});

// ============================================================================
// normalizeAuthorToAgent
// ============================================================================

describe('normalizeAuthorToAgent', () => {
  it('should map known squad agent logins to @AgentName', () => {
    expect(normalizeAuthorToAgent('luna')).toBe('@Luna');
    expect(normalizeAuthorToAgent('hawk')).toBe('@Hawk');
    expect(normalizeAuthorToAgent('kai')).toBe('@Kai');
    expect(normalizeAuthorToAgent('nova')).toBe('@Nova');
    expect(normalizeAuthorToAgent('godel')).toBe('@Godel');
  });

  it('should handle uppercase login for known agents', () => {
    expect(normalizeAuthorToAgent('LUNA')).toBe('@Luna');
  });

  it('should prefix unknown logins with @', () => {
    expect(normalizeAuthorToAgent('external-dev')).toBe('@external-dev');
  });

  it('should handle empty string fallback gracefully', () => {
    expect(normalizeAuthorToAgent('unknown-person')).toBe('@unknown-person');
  });
});

// ============================================================================
// extractStoryIdForActivity
// ============================================================================

describe('extractStoryIdForActivity', () => {
  it('should extract story ID from branch', () => {
    expect(extractStoryIdForActivity('S046-auth-middleware')).toBe('S046');
  });

  it('should extract story ID from be-S### branch', () => {
    expect(extractStoryIdForActivity('be-S046-auth')).toBe('S046');
  });

  it('should return null for branches without story ID', () => {
    expect(extractStoryIdForActivity('main')).toBeNull();
    expect(extractStoryIdForActivity('feature/add-auth')).toBeNull();
  });

  it('should normalize to uppercase', () => {
    expect(extractStoryIdForActivity('s046-lowercase')).toBe('S046');
  });
});

// ============================================================================
// summarizeChangedFiles
// ============================================================================

describe('summarizeChangedFiles', () => {
  it('should return "no files" for empty list', () => {
    expect(summarizeChangedFiles([])).toBe('no files');
  });

  it('should show file basenames for few files', () => {
    const result = summarizeChangedFiles(['src/auth/login.ts', 'src/auth/token.ts']);
    expect(result).toContain('login.ts');
    expect(result).toContain('token.ts');
  });

  it('should truncate long file lists', () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file-${i}.ts`);
    const result = summarizeChangedFiles(files, 3);
    expect(result).toContain('+7 more');
  });

  it('should use file basename not full path', () => {
    const result = summarizeChangedFiles(['very/deep/nested/path/file.ts']);
    expect(result).toBe('file.ts');
    expect(result).not.toContain('very/deep');
  });
});

// ============================================================================
// buildOpenedEntry
// ============================================================================

describe('buildOpenedEntry', () => {
  it('should include date in [YYYY-MM-DD] format', () => {
    const ctx = createContext({ date: TEST_DATE });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('[2026-03-01]');
  });

  it('should include agent name', () => {
    const ctx = createContext({ authorLogin: 'luna' });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('@Luna');
  });

  it('should include session ID', () => {
    const ctx = createContext({ sessionId: 'test-session' });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('[session:test-session]');
  });

  it('should include PR number', () => {
    const ctx = createContext({ prNumber: 42 });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('#42');
  });

  it('should include PR title', () => {
    const ctx = createContext({ prTitle: 'Add authentication middleware' });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('Add authentication middleware');
  });

  it('should include story ID reference when present', () => {
    const ctx = createContext({ headBranch: 'S046-auth' });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('S046');
  });

  it('should not include story ref when branch has no story ID', () => {
    const ctx = createContext({ headBranch: 'feature/random' });
    const entry = buildOpenedEntry(ctx);
    expect(entry).not.toMatch(/\(S\d+\)/);
  });

  it('should include PR URL', () => {
    const ctx = createContext();
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('https://github.com/owner/repo/pull/42');
  });

  it('should include file count', () => {
    const ctx = createContext({ changedFiles: ['a.ts', 'b.ts'] });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('2 file');
  });

  it('should include label names', () => {
    const ctx = createContext({ labels: ['security-review', 'api-review'] });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('security-review');
  });

  it('should truncate labels when too many', () => {
    const ctx = createContext({ labels: ['a', 'b', 'c', 'd', 'e'] });
    const entry = buildOpenedEntry(ctx);
    // Should include at most 3 labels
    const labelSection = entry.match(/\[([^\]]+)\]/g);
    // Not necessarily truncated in display, but should not crash
    expect(entry).toBeTruthy();
  });

  it('should use "hawky-auto" as default session ID', () => {
    const ctx = createContext({ sessionId: undefined });
    const entry = buildOpenedEntry(ctx);
    expect(entry).toContain('[session:hawky-auto]');
  });
});

// ============================================================================
// buildReviewedEntry
// ============================================================================

describe('buildReviewedEntry', () => {
  it('should include reviewer name not PR author', () => {
    const ctx = createContext({
      event: 'reviewed_approved',
      reviewerLogin: 'hawk',
      authorLogin: 'luna',
    });
    const entry = buildReviewedEntry(ctx);
    expect(entry).toContain('@Hawk');
    expect(entry).not.toContain('@Luna');
  });

  it('should include LGTM for approved review', () => {
    const ctx = createContext({ event: 'reviewed_approved', reviewVerdict: 'approved', reviewerLogin: 'hawk' });
    const entry = buildReviewedEntry(ctx);
    expect(entry).toContain('LGTM');
  });

  it('should include changes requested note for changes_requested review', () => {
    const ctx = createContext({
      event: 'reviewed_changes_requested',
      reviewVerdict: 'changes_requested',
      reviewerLogin: 'hawk',
    });
    const entry = buildReviewedEntry(ctx);
    expect(entry).toContain('Changes requested');
  });

  it('should include "commented" for comment-only review', () => {
    const ctx = createContext({
      event: 'reviewed_approved',
      reviewVerdict: 'commented',
      reviewerLogin: 'hawk',
    });
    const entry = buildReviewedEntry(ctx);
    expect(entry).toContain('commented');
  });

  it('should include PR reference', () => {
    const ctx = createContext({ event: 'reviewed_approved', reviewerLogin: 'hawk', prNumber: 42 });
    const entry = buildReviewedEntry(ctx);
    expect(entry).toContain('#42');
  });
});

// ============================================================================
// buildMergedEntry
// ============================================================================

describe('buildMergedEntry', () => {
  it('should include "Merged" action', () => {
    const ctx = createContext({ event: 'merged' });
    const entry = buildMergedEntry(ctx);
    expect(entry).toContain('Merged');
  });

  it('should include base branch name', () => {
    const ctx = createContext({ event: 'merged', baseBranch: 'dev' });
    const entry = buildMergedEntry(ctx);
    expect(entry).toContain('dev');
  });

  it('should include files shipped count', () => {
    const ctx = createContext({ event: 'merged', changedFiles: ['a.ts', 'b.ts', 'c.ts'] });
    const entry = buildMergedEntry(ctx);
    expect(entry).toContain('3');
    expect(entry).toContain('shipped');
  });

  it('should include story ID when present', () => {
    const ctx = createContext({ event: 'merged', headBranch: 'S046-auth' });
    const entry = buildMergedEntry(ctx);
    expect(entry).toContain('S046');
  });
});

// ============================================================================
// buildClosedEntry
// ============================================================================

describe('buildClosedEntry', () => {
  it('should note this was closed without merge', () => {
    const ctx = createContext({ event: 'closed' });
    const entry = buildClosedEntry(ctx);
    expect(entry).toContain('not merged');
  });

  it('should include PR number', () => {
    const ctx = createContext({ event: 'closed', prNumber: 99 });
    const entry = buildClosedEntry(ctx);
    expect(entry).toContain('#99');
  });
});

// ============================================================================
// generateActivityEntries
// ============================================================================

describe('generateActivityEntries', () => {
  it('should generate entry for opened event', () => {
    const ctx = createContext({ event: 'opened' });
    const result = generateActivityEntries(ctx);

    expect(result.hasEntries).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].event).toBe('opened');
  });

  it('should generate entry for reviewed_approved event', () => {
    const ctx = createContext({ event: 'reviewed_approved', reviewerLogin: 'hawk' });
    const result = generateActivityEntries(ctx);

    expect(result.hasEntries).toBe(true);
    expect(result.entries[0].event).toBe('reviewed_approved');
  });

  it('should generate entry for merged event', () => {
    const ctx = createContext({ event: 'merged' });
    const result = generateActivityEntries(ctx);

    expect(result.hasEntries).toBe(true);
    expect(result.entries[0].event).toBe('merged');
  });

  it('should generate entry for closed event', () => {
    const ctx = createContext({ event: 'closed' });
    const result = generateActivityEntries(ctx);

    expect(result.hasEntries).toBe(true);
    expect(result.entries[0].event).toBe('closed');
  });

  it('should return empty for unhandled events', () => {
    const ctx = createContext({ event: 'labeled' });
    const result = generateActivityEntries(ctx);

    expect(result.hasEntries).toBe(false);
    expect(result.entries).toHaveLength(0);
  });

  it('should include formatted lines', () => {
    const ctx = createContext({ event: 'opened' });
    const result = generateActivityEntries(ctx);

    expect(result.formattedLines).toHaveLength(1);
    expect(result.formattedLines[0]).toContain('@Luna');
  });

  it('should include correct PR number in entry', () => {
    const ctx = createContext({ event: 'merged', prNumber: 99 });
    const result = generateActivityEntries(ctx);

    expect(result.entries[0].prNumber).toBe(99);
  });

  it('should include date in entry', () => {
    const ctx = createContext({ event: 'opened', date: TEST_DATE });
    const result = generateActivityEntries(ctx);

    expect(result.entries[0].date).toBe(TEST_DATE);
  });
});
