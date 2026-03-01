/**
 * Tests for Feedback Learning Loop (S080)
 *
 * Tests the JSONL-based append-only feedback system.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadFeedbackEntries,
  appendFeedbackEntry,
  appendFeedbackEntries,
  recordFeedback,
  recordFeedbackBatch,
  computeMetrics,
  loadAndComputeMetrics,
  formatMetricsAsMarkdown,
  DEFAULT_FEEDBACK_PATH,
  type FeedbackEntry,
} from '../../src/llm/feedback';

// ============================================================================
// Helpers
// ============================================================================

let tempDir: string;
let feedbackPath: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-feedback-test-'));
  feedbackPath = path.join(tempDir, 'feedback.jsonl');
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

function createFullEntry(overrides: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    timestamp: new Date().toISOString(),
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
// loadFeedbackEntries (JSONL format)
// ============================================================================

describe('loadFeedbackEntries', () => {
  it('should return empty array when file does not exist', () => {
    const entries = loadFeedbackEntries('/nonexistent/path/feedback.jsonl');

    expect(entries).toEqual([]);
  });

  it('should load entries from JSONL file', () => {
    const entry1 = createFullEntry({ category: 'security' });
    const entry2 = createFullEntry({ category: 'performance' });

    fs.writeFileSync(
      feedbackPath,
      JSON.stringify(entry1) + '\n' + JSON.stringify(entry2) + '\n',
      'utf-8'
    );

    const entries = loadFeedbackEntries(feedbackPath);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.category).toBe('security');
    expect(entries[1]?.category).toBe('performance');
  });

  it('should skip malformed lines', () => {
    const validEntry = createFullEntry();

    fs.writeFileSync(
      feedbackPath,
      'not valid json\n' + JSON.stringify(validEntry) + '\n{ broken json\n',
      'utf-8'
    );

    const entries = loadFeedbackEntries(feedbackPath);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.prNumber).toBe(42);
  });

  it('should handle empty file', () => {
    fs.writeFileSync(feedbackPath, '', 'utf-8');

    const entries = loadFeedbackEntries(feedbackPath);

    expect(entries).toEqual([]);
  });

  it('should preserve all entry fields', () => {
    const entry: FeedbackEntry = {
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
    };

    fs.writeFileSync(feedbackPath, JSON.stringify(entry) + '\n', 'utf-8');

    const entries = loadFeedbackEntries(feedbackPath);

    expect(entries[0]).toEqual(entry);
  });
});

// ============================================================================
// appendFeedbackEntry / appendFeedbackEntries
// ============================================================================

describe('appendFeedbackEntry', () => {
  it('should create file if it does not exist', () => {
    const entry = createFullEntry();

    appendFeedbackEntry(entry, feedbackPath);

    expect(fs.existsSync(feedbackPath)).toBe(true);
  });

  it('should append entry as single line', () => {
    const entry = createFullEntry();

    appendFeedbackEntry(entry, feedbackPath);

    const content = fs.readFileSync(feedbackPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toEqual(entry);
  });

  it('should append to existing file', () => {
    const entry1 = createFullEntry({ category: 'security' });
    const entry2 = createFullEntry({ category: 'performance' });

    appendFeedbackEntry(entry1, feedbackPath);
    appendFeedbackEntry(entry2, feedbackPath);

    const entries = loadFeedbackEntries(feedbackPath);
    expect(entries).toHaveLength(2);
  });

  it('should create parent directories', () => {
    const nestedPath = path.join(tempDir, 'deeply', 'nested', 'feedback.jsonl');
    const entry = createFullEntry();

    appendFeedbackEntry(entry, nestedPath);

    expect(fs.existsSync(nestedPath)).toBe(true);
  });
});

describe('appendFeedbackEntries', () => {
  it('should append multiple entries at once', () => {
    const entries = [
      createFullEntry({ category: 'security' }),
      createFullEntry({ category: 'performance' }),
      createFullEntry({ category: 'type-safety' }),
    ];

    appendFeedbackEntries(entries, feedbackPath);

    const loaded = loadFeedbackEntries(feedbackPath);
    expect(loaded).toHaveLength(3);
  });

  it('should not create file for empty array', () => {
    appendFeedbackEntries([], feedbackPath);

    expect(fs.existsSync(feedbackPath)).toBe(false);
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

    const entries = loadFeedbackEntries(feedbackPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.timestamp).toBeTruthy();
    expect(new Date(entries[0]?.timestamp ?? '').getTime()).not.toBeNaN();
  });

  it('should append to existing file', () => {
    recordFeedback(createEntry({ category: 'security' }), feedbackPath);
    recordFeedback(createEntry({ category: 'performance' }), feedbackPath);

    const entries = loadFeedbackEntries(feedbackPath);
    expect(entries).toHaveLength(2);
  });

  it('should preserve all entry fields', () => {
    const entry = createEntry({
      prNumber: 99,
      category: 'type-safety',
      outcome: 'rejected',
      note: 'Too noisy',
    });

    recordFeedback(entry, feedbackPath);

    const entries = loadFeedbackEntries(feedbackPath);
    const saved = entries[0];

    expect(saved?.prNumber).toBe(99);
    expect(saved?.category).toBe('type-safety');
    expect(saved?.outcome).toBe('rejected');
    expect(saved?.note).toBe('Too noisy');
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

    const loaded = loadFeedbackEntries(feedbackPath);
    expect(loaded).toHaveLength(3);
  });

  it('should not modify file for empty batch', () => {
    recordFeedbackBatch([], feedbackPath);

    expect(fs.existsSync(feedbackPath)).toBe(false);
  });

  it('should append to existing entries', () => {
    recordFeedback(createEntry(), feedbackPath);
    recordFeedbackBatch([createEntry(), createEntry()], feedbackPath);

    const loaded = loadFeedbackEntries(feedbackPath);
    expect(loaded).toHaveLength(3);
  });

  it('should add timestamps to all entries', () => {
    const entries = [createEntry(), createEntry()];

    recordFeedbackBatch(entries, feedbackPath);

    const loaded = loadFeedbackEntries(feedbackPath);
    expect(loaded[0]?.timestamp).toBeTruthy();
    expect(loaded[1]?.timestamp).toBeTruthy();
  });
});

// ============================================================================
// computeMetrics
// ============================================================================

describe('computeMetrics', () => {
  it('should return zero metrics for empty array', () => {
    const metrics = computeMetrics([]);

    expect(metrics.totalEntries).toBe(0);
    expect(metrics.overallAcceptanceRate).toBe(0);
    expect(metrics.categoryRates).toEqual({});
    expect(metrics.topAcceptedCategories).toEqual([]);
    expect(metrics.topRejectedCategories).toEqual([]);
  });

  it('should compute overall acceptance rate', () => {
    // 3 accepted, 1 rejected → 75% acceptance rate
    const entries: FeedbackEntry[] = [
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'rejected' }),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.overallAcceptanceRate).toBe(0.75);
    expect(metrics.totalEntries).toBe(4);
  });

  it('should exclude dismissed from acceptance rate calculation', () => {
    // 1 accepted, 1 rejected, 10 dismissed → 50% acceptance rate (1/2, not 1/12)
    const entries: FeedbackEntry[] = [
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'rejected' }),
      ...Array.from({ length: 10 }, () => createFullEntry({ outcome: 'dismissed' })),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.overallAcceptanceRate).toBe(0.5);
  });

  it('should compute per-category rates', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ category: 'security', outcome: 'accepted' }),
      createFullEntry({ category: 'security', outcome: 'rejected' }),
      createFullEntry({ category: 'performance', outcome: 'accepted' }),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.categoryRates['security']?.acceptanceRate).toBe(0.5);
    expect(metrics.categoryRates['performance']?.acceptanceRate).toBe(1);
  });

  it('should compute per-severity rates', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ severity: 'error', outcome: 'accepted' }),
      createFullEntry({ severity: 'error', outcome: 'rejected' }),
      createFullEntry({ severity: 'warning', outcome: 'accepted' }),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.severityRates['error']?.acceptanceRate).toBe(0.5);
    expect(metrics.severityRates['warning']?.acceptanceRate).toBe(1);
  });

  it('should identify top accepted categories with sufficient samples', () => {
    // security: 5 entries, all accepted → top accepted
    // performance: 5 entries, all rejected → top rejected
    const entries: FeedbackEntry[] = [
      ...Array.from({ length: 5 }, () =>
        createFullEntry({ category: 'security', outcome: 'accepted' })
      ),
      ...Array.from({ length: 5 }, () =>
        createFullEntry({ category: 'performance', outcome: 'rejected' })
      ),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.topAcceptedCategories).toContain('security');
    expect(metrics.topRejectedCategories).toContain('performance');
  });

  it('should not include categories with fewer than 5 samples in top lists', () => {
    // Only 3 entries for security — below MIN_RELIABLE_SAMPLES
    const entries: FeedbackEntry[] = Array.from({ length: 3 }, () =>
      createFullEntry({ category: 'security', outcome: 'accepted' })
    );

    const metrics = computeMetrics(entries);

    expect(metrics.topAcceptedCategories).not.toContain('security');
  });

  it('should compute date range correctly', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ timestamp: '2026-01-01T00:00:00Z' }),
      createFullEntry({ timestamp: '2026-03-01T00:00:00Z' }),
      createFullEntry({ timestamp: '2026-02-15T00:00:00Z' }),
    ];

    const metrics = computeMetrics(entries);

    expect(metrics.dateRange.earliest).toBe('2026-01-01T00:00:00Z');
    expect(metrics.dateRange.latest).toBe('2026-03-01T00:00:00Z');
  });
});

// ============================================================================
// loadAndComputeMetrics
// ============================================================================

describe('loadAndComputeMetrics', () => {
  it('should load entries and compute metrics in one call', () => {
    const entries = [
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'rejected' }),
    ];

    for (const entry of entries) {
      appendFeedbackEntry(entry, feedbackPath);
    }

    const metrics = loadAndComputeMetrics(feedbackPath);

    expect(metrics.totalEntries).toBe(2);
    expect(metrics.overallAcceptanceRate).toBe(0.5);
  });

  it('should return zero metrics for non-existent file', () => {
    const metrics = loadAndComputeMetrics('/nonexistent/path/feedback.jsonl');

    expect(metrics.totalEntries).toBe(0);
  });
});

// ============================================================================
// formatMetricsAsMarkdown
// ============================================================================

describe('formatMetricsAsMarkdown', () => {
  it('should show empty message for no entries', () => {
    const metrics = computeMetrics([]);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('No feedback entries');
  });

  it('should include total entries and overall rate', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ outcome: 'accepted' }),
      createFullEntry({ outcome: 'accepted' }),
    ];

    const metrics = computeMetrics(entries);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('2');
    expect(md).toContain('100%');
  });

  it('should include category breakdown table', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ category: 'security', outcome: 'accepted' }),
    ];

    const metrics = computeMetrics(entries);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('By Category');
    expect(md).toContain('security');
  });

  it('should include severity breakdown table', () => {
    const entries: FeedbackEntry[] = [
      createFullEntry({ severity: 'error', outcome: 'rejected' }),
    ];

    const metrics = computeMetrics(entries);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('By Severity');
    expect(md).toContain('error');
  });

  it('should include top accepted/rejected categories when available', () => {
    const entries: FeedbackEntry[] = [
      ...Array.from({ length: 5 }, () =>
        createFullEntry({ category: 'security', outcome: 'accepted' })
      ),
      ...Array.from({ length: 5 }, () =>
        createFullEntry({ category: 'performance', outcome: 'rejected' })
      ),
    ];

    const metrics = computeMetrics(entries);
    const md = formatMetricsAsMarkdown(metrics);

    expect(md).toContain('Most accepted');
    expect(md).toContain('Most rejected');
    expect(md).toContain('security');
    expect(md).toContain('performance');
  });
});

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('should export DEFAULT_FEEDBACK_PATH constant with JSONL extension', () => {
    expect(DEFAULT_FEEDBACK_PATH).toBe('.hawky/feedback.jsonl');
  });
});
