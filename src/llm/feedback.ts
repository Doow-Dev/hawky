/**
 * Feedback Learning Loop (S080)
 *
 * Tracks which LLM suggestions were accepted or rejected by developers.
 * Logs to .hawky/feedback.jsonl (append-only JSONL format) for future tuning.
 *
 * JSONL format: Each line is a standalone JSON object.
 * Append-only: New entries are added without reading/rewriting the file.
 *
 * Metrics tracked:
 * - Acceptance rate per category (security, performance, type-safety, etc.)
 * - Overall acceptance rate
 * - Per-severity acceptance rates
 *
 * This data enables:
 * - Adjusting confidence thresholds per category
 * - Identifying noisy rules to suppress
 * - Understanding which suggestions are actionable
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * The outcome of a single suggestion
 */
export type FeedbackOutcome = 'accepted' | 'rejected' | 'dismissed';

/**
 * A single feedback entry (one line in the JSONL file)
 */
export interface FeedbackEntry {
  /** When this feedback was recorded */
  timestamp: string;

  /** PR number where the suggestion was made */
  prNumber: number;

  /** Repository (owner/repo) */
  repository: string;

  /** Commit SHA */
  commitSha: string;

  /** Category of the LLM finding */
  category: string;

  /** Severity of the original finding */
  severity: 'error' | 'warning' | 'info';

  /** Whether the suggestion was accepted, rejected, or dismissed */
  outcome: FeedbackOutcome;

  /** File where the issue was found */
  file: string;

  /** Line number */
  line: number;

  /** The LLM rule/message identifier (for tracking) */
  ruleId: string;

  /** Optional developer note */
  note?: string;
}

/**
 * Aggregated metrics from the feedback log
 */
export interface FeedbackMetrics {
  /** Total entries in the log */
  totalEntries: number;

  /** Overall acceptance rate (0-1) */
  overallAcceptanceRate: number;

  /** Per-category acceptance rates */
  categoryRates: Record<string, CategoryMetrics>;

  /** Per-severity acceptance rates */
  severityRates: Record<string, CategoryMetrics>;

  /** Top accepted categories (highest acceptance rate, minimum 5 samples) */
  topAcceptedCategories: string[];

  /** Top rejected categories (lowest acceptance rate, minimum 5 samples) */
  topRejectedCategories: string[];

  /** Date range of entries */
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

/**
 * Metrics for a single category or severity
 */
export interface CategoryMetrics {
  /** Total suggestions in this category */
  total: number;

  /** Number accepted */
  accepted: number;

  /** Number rejected */
  rejected: number;

  /** Number dismissed (no action taken) */
  dismissed: number;

  /** Acceptance rate (accepted / (accepted + rejected), excludes dismissed) */
  acceptanceRate: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default path for feedback file (JSONL format) */
export const DEFAULT_FEEDBACK_PATH = '.hawky/feedback.jsonl';

/** Minimum sample size for category rate to be "reliable" */
const MIN_RELIABLE_SAMPLES = 5;

// ============================================================================
// File I/O (JSONL)
// ============================================================================

/**
 * Load all feedback entries from the JSONL file.
 * Returns empty array if the file doesn't exist.
 *
 * JSONL format: Each line is a standalone JSON object.
 */
export function loadFeedbackEntries(feedbackPath: string = DEFAULT_FEEDBACK_PATH): FeedbackEntry[] {
  try {
    if (!fs.existsSync(feedbackPath)) {
      return [];
    }

    const raw = fs.readFileSync(feedbackPath, 'utf-8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    const entries: FeedbackEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as FeedbackEntry;
        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Append a single entry to the JSONL file.
 * Creates parent directories if they don't exist.
 *
 * This is O(1) — no need to read the existing file.
 */
export function appendFeedbackEntry(
  entry: FeedbackEntry,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  const dir = path.dirname(feedbackPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(feedbackPath, line, 'utf-8');
}

/**
 * Append multiple entries to the JSONL file (batch).
 * More efficient than multiple single appends.
 */
export function appendFeedbackEntries(
  entries: FeedbackEntry[],
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  if (entries.length === 0) return;

  const dir = path.dirname(feedbackPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
  fs.appendFileSync(feedbackPath, lines, 'utf-8');
}

// ============================================================================
// Recording Feedback
// ============================================================================

/**
 * Record a feedback entry for an LLM suggestion.
 *
 * Appends to the JSONL file (O(1), no file read needed).
 * Creates the file if it doesn't exist.
 */
export function recordFeedback(
  entry: Omit<FeedbackEntry, 'timestamp'>,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  const fullEntry: FeedbackEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  appendFeedbackEntry(fullEntry, feedbackPath);
}

/**
 * Record multiple feedback entries at once (batch)
 */
export function recordFeedbackBatch(
  entries: Array<Omit<FeedbackEntry, 'timestamp'>>,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  if (entries.length === 0) return;

  const now = new Date().toISOString();
  const fullEntries: FeedbackEntry[] = entries.map((entry) => ({
    ...entry,
    timestamp: now,
  }));

  appendFeedbackEntries(fullEntries, feedbackPath);
}

// ============================================================================
// Metrics Computation
// ============================================================================

/**
 * Compute metrics for a group of entries
 */
function computeGroupMetrics(entries: FeedbackEntry[]): CategoryMetrics {
  const accepted = entries.filter((e) => e.outcome === 'accepted').length;
  const rejected = entries.filter((e) => e.outcome === 'rejected').length;
  const dismissed = entries.filter((e) => e.outcome === 'dismissed').length;
  const total = entries.length;

  // Acceptance rate excludes dismissed (they're neutral — developer didn't engage)
  const actionable = accepted + rejected;
  const acceptanceRate = actionable > 0 ? accepted / actionable : 0;

  return { total, accepted, rejected, dismissed, acceptanceRate };
}

/**
 * Compute aggregated metrics from feedback entries
 */
export function computeMetrics(entries: FeedbackEntry[]): FeedbackMetrics {
  const totalEntries = entries.length;

  if (totalEntries === 0) {
    return {
      totalEntries: 0,
      overallAcceptanceRate: 0,
      categoryRates: {},
      severityRates: {},
      topAcceptedCategories: [],
      topRejectedCategories: [],
      dateRange: { earliest: null, latest: null },
    };
  }

  // Overall rate
  const overallMetrics = computeGroupMetrics(entries);
  const overallAcceptanceRate = overallMetrics.acceptanceRate;

  // Per-category rates
  const categoryGroups = new Map<string, FeedbackEntry[]>();
  for (const entry of entries) {
    const key = entry.category || 'uncategorized';
    const group = categoryGroups.get(key) ?? [];
    group.push(entry);
    categoryGroups.set(key, group);
  }

  const categoryRates: Record<string, CategoryMetrics> = {};
  for (const [category, categoryEntries] of categoryGroups) {
    categoryRates[category] = computeGroupMetrics(categoryEntries);
  }

  // Per-severity rates
  const severityGroups = new Map<string, FeedbackEntry[]>();
  for (const entry of entries) {
    const group = severityGroups.get(entry.severity) ?? [];
    group.push(entry);
    severityGroups.set(entry.severity, group);
  }

  const severityRates: Record<string, CategoryMetrics> = {};
  for (const [severity, severityEntries] of severityGroups) {
    severityRates[severity] = computeGroupMetrics(severityEntries);
  }

  // Top accepted/rejected categories (with minimum sample size)
  const reliableCategories = Object.entries(categoryRates).filter(
    ([, metrics]) => metrics.total >= MIN_RELIABLE_SAMPLES
  );

  const topAcceptedCategories = reliableCategories
    .sort(([, a], [, b]) => b.acceptanceRate - a.acceptanceRate)
    .slice(0, 3)
    .map(([category]) => category);

  const topRejectedCategories = reliableCategories
    .sort(([, a], [, b]) => a.acceptanceRate - b.acceptanceRate)
    .slice(0, 3)
    .map(([category]) => category);

  // Date range
  const timestamps = entries.map((e) => e.timestamp).sort();
  const earliest = timestamps[0] ?? null;
  const latest = timestamps[timestamps.length - 1] ?? null;

  return {
    totalEntries,
    overallAcceptanceRate,
    categoryRates,
    severityRates,
    topAcceptedCategories,
    topRejectedCategories,
    dateRange: { earliest, latest },
  };
}

/**
 * Load feedback entries and compute metrics in one call
 */
export function loadAndComputeMetrics(
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): FeedbackMetrics {
  const entries = loadFeedbackEntries(feedbackPath);
  return computeMetrics(entries);
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format feedback metrics as a markdown summary
 */
export function formatMetricsAsMarkdown(metrics: FeedbackMetrics): string {
  const lines: string[] = ['## Hawky Feedback Metrics', ''];

  if (metrics.totalEntries === 0) {
    lines.push('*No feedback entries recorded yet.*');
    return lines.join('\n');
  }

  const overallPct = Math.round(metrics.overallAcceptanceRate * 100);
  lines.push(`**Total suggestions tracked:** ${metrics.totalEntries}`);
  lines.push(`**Overall acceptance rate:** ${overallPct}%`);
  lines.push('');

  // Category breakdown
  const categoryEntries = Object.entries(metrics.categoryRates);
  if (categoryEntries.length > 0) {
    lines.push('### By Category');
    lines.push('');
    lines.push('| Category | Total | Accepted | Rejected | Rate |');
    lines.push('|----------|-------|----------|----------|------|');

    for (const [category, m] of categoryEntries.sort(([a], [b]) => a.localeCompare(b))) {
      const rate = Math.round(m.acceptanceRate * 100);
      lines.push(`| ${category} | ${m.total} | ${m.accepted} | ${m.rejected} | ${rate}% |`);
    }

    lines.push('');
  }

  // Severity breakdown
  const severityEntries = Object.entries(metrics.severityRates);
  if (severityEntries.length > 0) {
    lines.push('### By Severity');
    lines.push('');
    lines.push('| Severity | Total | Accepted | Rejected | Rate |');
    lines.push('|----------|-------|----------|----------|------|');

    for (const [severity, m] of severityEntries) {
      const rate = Math.round(m.acceptanceRate * 100);
      lines.push(`| ${severity} | ${m.total} | ${m.accepted} | ${m.rejected} | ${rate}% |`);
    }

    lines.push('');
  }

  // Insights
  if (metrics.topAcceptedCategories.length > 0) {
    lines.push(
      `:white_check_mark: **Most accepted:** ${metrics.topAcceptedCategories.join(', ')}`
    );
  }

  if (metrics.topRejectedCategories.length > 0) {
    lines.push(
      `:x: **Most rejected:** ${metrics.topRejectedCategories.join(', ')}`
    );
  }

  if (metrics.dateRange.earliest) {
    lines.push('');
    lines.push(
      `*Data range: ${metrics.dateRange.earliest.slice(0, 10)} to ${metrics.dateRange.latest?.slice(0, 10) ?? 'now'}*`
    );
  }

  return lines.join('\n');
}
