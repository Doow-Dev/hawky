/**
 * Feedback Learning Loop (S080)
 *
 * Tracks which LLM suggestions were accepted or rejected by developers.
 * Logs to .hawky/feedback.json for future tuning.
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
 * A single feedback entry
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

/**
 * The feedback JSON file structure
 */
export interface FeedbackFile {
  /** Schema version for forward compatibility */
  version: '1';

  /** All feedback entries */
  entries: FeedbackEntry[];

  /** Cached metrics (regenerated on read) */
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default path for feedback file */
export const DEFAULT_FEEDBACK_PATH = '.hawky/feedback.json';

/** Minimum sample size for category rate to be "reliable" */
const MIN_RELIABLE_SAMPLES = 5;

// ============================================================================
// File I/O
// ============================================================================

/**
 * Load the feedback file from disk.
 * Returns null if the file doesn't exist.
 */
export function loadFeedback(feedbackPath: string = DEFAULT_FEEDBACK_PATH): FeedbackFile | null {
  try {
    if (!fs.existsSync(feedbackPath)) {
      return null;
    }

    const raw = fs.readFileSync(feedbackPath, 'utf-8');
    const parsed = JSON.parse(raw) as FeedbackFile;

    // Validate structure
    if (!Array.isArray(parsed.entries)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save the feedback file to disk.
 * Creates parent directories if they don't exist.
 */
export function saveFeedback(
  feedback: FeedbackFile,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  const dir = path.dirname(feedbackPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), 'utf-8');
}

/**
 * Create a new empty feedback file
 */
export function createEmptyFeedback(): FeedbackFile {
  return {
    version: '1',
    entries: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// Recording Feedback
// ============================================================================

/**
 * Record a feedback entry for an LLM suggestion.
 *
 * Loads the existing feedback file, appends the entry, and saves.
 * Creates the file if it doesn't exist.
 */
export function recordFeedback(
  entry: Omit<FeedbackEntry, 'timestamp'>,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  const feedback = loadFeedback(feedbackPath) ?? createEmptyFeedback();

  const fullEntry: FeedbackEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  feedback.entries.push(fullEntry);
  feedback.lastUpdated = new Date().toISOString();

  saveFeedback(feedback, feedbackPath);
}

/**
 * Record multiple feedback entries at once (batch)
 */
export function recordFeedbackBatch(
  entries: Array<Omit<FeedbackEntry, 'timestamp'>>,
  feedbackPath: string = DEFAULT_FEEDBACK_PATH
): void {
  if (entries.length === 0) return;

  const feedback = loadFeedback(feedbackPath) ?? createEmptyFeedback();
  const now = new Date().toISOString();

  for (const entry of entries) {
    feedback.entries.push({ ...entry, timestamp: now });
  }

  feedback.lastUpdated = now;
  saveFeedback(feedback, feedbackPath);
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
 * Compute aggregated metrics from a feedback file
 */
export function computeMetrics(feedback: FeedbackFile): FeedbackMetrics {
  const entries = feedback.entries;
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
