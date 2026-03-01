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
/** Default path for feedback file (JSONL format) */
export declare const DEFAULT_FEEDBACK_PATH = ".hawky/feedback.jsonl";
/**
 * Load all feedback entries from the JSONL file.
 * Returns empty array if the file doesn't exist.
 *
 * JSONL format: Each line is a standalone JSON object.
 */
export declare function loadFeedbackEntries(feedbackPath?: string): FeedbackEntry[];
/**
 * Append a single entry to the JSONL file.
 * Creates parent directories if they don't exist.
 *
 * This is O(1) — no need to read the existing file.
 */
export declare function appendFeedbackEntry(entry: FeedbackEntry, feedbackPath?: string): void;
/**
 * Append multiple entries to the JSONL file (batch).
 * More efficient than multiple single appends.
 */
export declare function appendFeedbackEntries(entries: FeedbackEntry[], feedbackPath?: string): void;
/**
 * Record a feedback entry for an LLM suggestion.
 *
 * Appends to the JSONL file (O(1), no file read needed).
 * Creates the file if it doesn't exist.
 */
export declare function recordFeedback(entry: Omit<FeedbackEntry, 'timestamp'>, feedbackPath?: string): void;
/**
 * Record multiple feedback entries at once (batch)
 */
export declare function recordFeedbackBatch(entries: Array<Omit<FeedbackEntry, 'timestamp'>>, feedbackPath?: string): void;
/**
 * Compute aggregated metrics from feedback entries
 */
export declare function computeMetrics(entries: FeedbackEntry[]): FeedbackMetrics;
/**
 * Load feedback entries and compute metrics in one call
 */
export declare function loadAndComputeMetrics(feedbackPath?: string): FeedbackMetrics;
/**
 * Format feedback metrics as a markdown summary
 */
export declare function formatMetricsAsMarkdown(metrics: FeedbackMetrics): string;
//# sourceMappingURL=feedback.d.ts.map