/**
 * Tests for Feedback Learning Loop (S080)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadFeedback,
  saveFeedback,
  createEmptyFeedback,
  recordFeedback,
  recordFeedbackBatch,
  computeMetrics,
  formatMetricsAsMarkdown,
  DEFAULT_FEEDBACK_PATH,
  type FeedbackEntry,
  type FeedbackFile,
} from '../../src/llm/feedback';

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;
let feedbackPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-feedback-test-'));
  feedbackPath = path.join(tempDir, 'feedback.json');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createEntry(overrides: Partial<FeedbackEntry> = {}): Omit<FeedbackEntry, 'timestamp'> {
  return {
    prNumber: 42,
    repository: 'owner/repo',
    commitSha: 'abc1234',
    category: 'security',
    severity: 'error',
    outcome: 'accepted',
    file: 'src/auth.ts',
    line: 10,
    ruleId: 'llm-security',
    ...overrides,
  };
}

// ============================================================================
// createEmptyFeedback
// ============================================================================

describe('createEmptyFeedback', () => {
  it('should create empty feedback with correct schema version', () => {
    const feedback = createEmptyFeedback();

    expect(feedback.version).toBe('1');
    expect(feedback.entries).toEqual([]);
    expect(feedback.lastUpdated).toBeTruthy();
  });

  it('should have a valid ISO timestamp', () => {
    const feedback = createEmptyFeedback();
    const date = new Date(feedback.lastUpdated);

    expect(date.getTime()).not.toBeNaN();
  });
});

// ============================================================================
// saveFeedback / loadFeedback
// ============================================================================

describe('saveFeedback and loadFeedback', () => {
  it('should save and load feedback correctly', () => {
    const feedback = createEmptyFeedback();
    saveFeedback(feedback, feedbackPath);

    const loaded = loadFeedback(feedbackPath);

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe('1');
    expect(loaded?.entries).toEqual([]);
  });

  it('should return null when file does not exist', () => {
    const result = loadFeedback('/nonexistent/path/feedback.json');

    expect(result).toBeNull();
  });

  it('should create parent directories when saving', () => {
    const nestedPath = path.join(tempDir, 'deeply', 'nested', 'feedback.json');
    const feedback = createEmptyFeedback();

    saveFeedback(feedback, nestedPath);

    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('should return null for malformed JSON', () => {
    fs.writeFileSync(feedbackPath, 'not valid json', 'utf-8');

    const result = loadFeedback(feedbackPath);

    expect(result).toBeNull();
  });

  it('should return null when entries is not an array', () => {
    fs.writeFileSync(
      feedbackPath,
      JSON.stringify({ version: '1', entries: 'not-array', lastUpdated: '' }),
      'utf-8'
    );

    const result = loadFeedback(feedbackPath);

    expect(result).toBeNull();
  });

  it('should preserve all entry fields when round-tripping', () => {
    const feedback = createEmptyFeedback();
    feedback.entries.push({
      timestamp: '2026-03-01T12:00:00Z',
      prNumber: 99,
      repository: 'test/repo',
      commitSha: 'deadbeef',
      category: 'performance',
      severity: 'warning',
      outcome: 'rejected',
      file: 'src/perf.ts',
      line: 50,
      ruleId: 'llm-performance',
      note: 'Not applicable to our use case',
    });

    saveFeedback(feedback, feedbackPath);
    const loaded = loadFeedback(feedbackPath);

    expect(loaded?.entries[0]).toEqual(feedback.entries[0]);
  });
});

// ============================================================================
// recordFeedback
// ============================================================================

describe('recordFeedback', () => {
  it('should create feedback file if it does not exist', () => {
    recordFeedback(createEntry(), feedbackPath);

    expect(fs.existsSync(feedbackPath)).toBe(true);
  });

  it('should add entry with timestamp', () => {
    recordFeedback(createEntry(), feedbackPath);

    const loaded = loadFeedback(feedbackPath);
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.entries[0]?.timestamp).toBeTruthy();
    expect(new Date(loaded?.entries[0]?.timestamp ?? '').getTime()).not.toBeNaN();
  });

  it('should append to existing file', () => {
    recordFeedback(createEntry({ category: 'security' }), feedbackPath);
    recordFeedback(createEntry({ category: 'performance' }), feedbackPath);

    const loaded = loadFeedback(feedbackPath);
    expect(loaded?.entries).toHaveLength(2);
  });

  it('should preserve all entry fields', () => {
    const entry = createEntry({
      prNumber: 99,
      category: 'type-safety',
      outcome: 'rejected',
      note: 'Too noisy',
    });

    recordFeedback(entry, feedbackPath);

    const loaded = loadFeedback(feedbackPath);
    const saved = loaded?.entries[0];

    expect(saved?.prNumber).toBe(99);
    expect(saved?.category).toBe('type-safety');
    expect(saved?.outcome).toBe('rejected');
    expect(saved?.note).toBe('Too noisy');
  });

  it('should update lastUpdated when adding entries', () => {
    const before = new Date().toISOString();
    recordFeedback(createEntry(), feedbackPath);
    const after = new Date().toISOString();

    const loaded = loadFeedback(feedbackPath);
    expect(loaded?.lastUpdated.localeCompare(before)).toBeGreaterThanOrEqual(0);
    expect(loaded?.lastUpdated.localeCompare(after)).toBeLessThanOrEqual(0);
  });
});

// ============================================================================
// recordFeedbackBatch
// ============================================================================

describe('recordFeedbackBatch', () => {
  it('should record multiple entries at once', () => {
    const entries = [
      createEntry({ category: 'security', outcome: 'accepted' }),
      createEntry({ category: 'performance', outcome: 'rejected' }),
      createEntry({ category: 'type-safety', outcome: 'dismissed' }),
    ];

    recordFeedbackBatch(entries, feedbackPath);

    const loaded = loadFeedback(feedbackPath);
    expect(loaded?.entries).toHaveLength(3);
  });

  it('should not modify file for empty batch', () => {
    recordFeedbackBatch([], feedbackPath);

    expect(fs.existsSync(feedbackPath)).toBe(false);
  });

  it('should append to existing entries', () => {
    recordFeedback(createEntry(), feedbackPath);
    recordFeedbackBatch([createEntry(), createEntry()], feedbackPath);

    const loaded = loadFeedback(feedbackPath);
    expect(loaded?.entries).toHaveLength(3);
  });
});

// ============================================================================
// computeMetrics
// ============================================================================

describe('computeMetrics', () => {
  it('should return zero metrics for empty feedback', () => {
    const metrics = computeMetrics(createEmptyFeedback());

    expect(metrics.totalEntries).toBe(0);
    expect(metrics.overallAcceptanceRate).toBe(0);
    expect(metrics.categoryRates).toEqual({});
    expect(metrics.topAcceptedCategories).toEqual([]);
    expect(metrics.topRejectedCategories).toEqual([]);
  });

  it('should compute overall acceptance rate', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    // 3 accepted, 1 rejected → 75% acceptance rate
    feedback.entries = [
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
      { ...createEntry(), timestamp: now, outcome: 'rejected' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.overallAcceptanceRate).toBe(0.75);
    expect(metrics.totalEntries).toBe(4);
  });

  it('should exclude dismissed from acceptance rate calculation', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    // 1 accepted, 1 rejected, 10 dismissed → 50% acceptance rate (1/2, not 1/12)
    feedback.entries = [
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
      { ...createEntry(), timestamp: now, outcome: 'rejected' },
      ...Array.from({ length: 10 }, () => ({ ...createEntry(), timestamp: now, outcome: 'dismissed' as const })),
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.overallAcceptanceRate).toBe(0.5);
  });

  it('should compute per-category rates', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    feedback.entries = [
      { ...createEntry(), timestamp: now, category: 'security', outcome: 'accepted' },
      { ...createEntry(), timestamp: now, category: 'security', outcome: 'rejected' },
      { ...createEntry(), timestamp: now, category: 'performance', outcome: 'accepted' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.categoryRates['security']?.acceptanceRate).toBe(0.5);
    expect(metrics.categoryRates['performance']?.acceptanceRate).toBe(1);
  });

  it('should compute per-severity rates', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    feedback.entries = [
      { ...createEntry(), timestamp: now, severity: 'error', outcome: 'accepted' },
      { ...createEntry(), timestamp: now, severity: 'error', outcome: 'rejected' },
      { ...createEntry(), timestamp: now, severity: 'warning', outcome: 'accepted' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.severityRates['error']?.acceptanceRate).toBe(0.5);
    expect(metrics.severityRates['warning']?.acceptanceRate).toBe(1);
  });

  it('should identify top accepted categories with sufficient samples', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    // security: 5 entries, all accepted → top accepted
    // performance: 5 entries, all rejected → top rejected
    feedback.entries = [
      ...Array.from({ length: 5 }, () => ({
        ...createEntry(), timestamp: now, category: 'security', outcome: 'accepted' as const
      })),
      ...Array.from({ length: 5 }, () => ({
        ...createEntry(), timestamp: now, category: 'performance', outcome: 'rejected' as const
      })),
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.topAcceptedCategories).toContain('security');
    expect(metrics.topRejectedCategories).toContain('performance');
  });

  it('should not include categories with fewer than 5 samples in top lists', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    // Only 3 entries for security — below MIN_RELIABLE_SAMPLES
    feedback.entries = Array.from({ length: 3 }, () => ({
      ...createEntry(), timestamp: now, category: 'security', outcome: 'accepted' as const
    })) as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.topAcceptedCategories).not.toContain('security');
  });

  it('should compute date range correctly', () => {
    const feedback = createEmptyFeedback();
    feedback.entries = [
      { ...createEntry(), timestamp: '2026-01-01T00:00:00Z', outcome: 'accepted' },
      { ...createEntry(), timestamp: '2026-03-01T00:00:00Z', outcome: 'accepted' },
      { ...createEntry(), timestamp: '2026-02-15T00:00:00Z', outcome: 'accepted' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);

    expect(metrics.dateRange.earliest).toBe('2026-01-01T00:00:00Z');
    expect(metrics.dateRange.latest).toBe('2026-03-01T00:00:00Z');
  });
});

// ============================================================================
// formatMetricsAsMarkdown
// ============================================================================

describe('formatMetricsAsMarkdown', () => {
  it('should show empty message for no entries', () => {
    const metrics = computeMetrics(createEmptyFeedback());
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('No feedback entries');
  });

  it('should include total entries and overall rate', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();
    feedback.entries = [
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
      { ...createEntry(), timestamp: now, outcome: 'accepted' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('2');
    expect(md).toContain('100%');
  });

  it('should include category breakdown table', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();
    feedback.entries = [
      { ...createEntry(), timestamp: now, category: 'security', outcome: 'accepted' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('By Category');
    expect(md).toContain('security');
  });

  it('should include severity breakdown table', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();
    feedback.entries = [
      { ...createEntry(), timestamp: now, severity: 'error', outcome: 'rejected' },
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('By Severity');
    expect(md).toContain('error');
  });

  it('should include top accepted/rejected categories when available', () => {
    const feedback = createEmptyFeedback();
    const now = new Date().toISOString();

    feedback.entries = [
      ...Array.from({ length: 5 }, () => ({ ...createEntry(), timestamp: now, category: 'security', outcome: 'accepted' as const })),
      ...Array.from({ length: 5 }, () => ({ ...createEntry(), timestamp: now, category: 'performance', outcome: 'rejected' as const })),
    ] as FeedbackEntry[];

    const metrics = computeMetrics(feedback);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('Most accepted');
    expect(md).toContain('Most rejected');
    expect(md).toContain('security');
    expect(md).toContain('performance');
  });

  it('should export DEFAULT_FEEDBACK_PATH constant', () => {
    expect(DEFAULT_FEEDBACK_PATH).toBe('.hawky/feedback.json');
  });
});
