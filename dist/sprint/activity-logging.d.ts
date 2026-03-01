/**
 * ACTIVITY.md Auto-Logging (S049)
 *
 * Generates ACTIVITY.md log entries for PR lifecycle events:
 * - PR opened: logs who opened it, story reference, labels
 * - PR reviewed: logs reviewer, outcome (LGTM/changes requested)
 * - PR merged: logs who merged, what was shipped
 *
 * Follows the squad entry format:
 * [YYYY-MM-DD] @AgentName [session:ID]: Content
 *
 * Output: INFORM tier — generates log entries (caller writes to file).
 */
/**
 * PR event that triggers an activity log entry
 */
export type PREvent = 'opened' | 'merged' | 'closed' | 'review_requested' | 'reviewed_approved' | 'reviewed_changes_requested' | 'labeled' | 'unlabeled';
/**
 * Context for a PR event
 */
export interface PREventContext {
    /** PR number */
    prNumber: number;
    /** PR title */
    prTitle: string;
    /** PR URL */
    prUrl: string;
    /** PR author login */
    authorLogin: string;
    /** Head branch name */
    headBranch: string;
    /** Base branch name */
    baseBranch: string;
    /** Files changed (for summary) */
    changedFiles: string[];
    /** PR labels */
    labels: string[];
    /** The event type */
    event: PREvent;
    /** Reviewer login (for review events) */
    reviewerLogin?: string;
    /** Review verdict (for reviewed events) */
    reviewVerdict?: 'approved' | 'changes_requested' | 'commented';
    /** Date of the event (ISO string) */
    date: string;
    /** Project name for log context tag */
    projectName: string;
    /** Session ID (defaults to 'hawky-auto') */
    sessionId?: string;
}
/**
 * A generated activity log entry
 */
export interface ActivityEntry {
    /** The formatted log line */
    line: string;
    /** The event that generated it */
    event: PREvent;
    /** PR number */
    prNumber: number;
    /** Date of the entry (ISO string) */
    date: string;
}
/**
 * Result of activity log generation
 */
export interface ActivityLoggingResult {
    /** Generated entries */
    entries: ActivityEntry[];
    /** Whether any entries were generated */
    hasEntries: boolean;
    /** All formatted lines ready to prepend to ACTIVITY.md */
    formattedLines: string[];
}
/**
 * Format a date string as YYYY-MM-DD
 */
export declare function formatDate(isoDate: string): string;
/**
 * Normalize a GitHub login to an @AgentName format.
 * Looks up known agent names, falls back to title-cased login.
 */
export declare function normalizeAuthorToAgent(login: string): string;
/**
 * Extract a story ID from a branch name (S### pattern)
 */
export declare function extractStoryIdForActivity(branchName: string): string | null;
/**
 * Generate a summary of what the PR touches
 */
export declare function summarizeChangedFiles(files: string[], maxFiles?: number): string;
/**
 * Generate the log line content for a PR opened event
 */
export declare function buildOpenedEntry(ctx: PREventContext): string;
/**
 * Generate the log line content for a PR reviewed event
 */
export declare function buildReviewedEntry(ctx: PREventContext): string;
/**
 * Generate the log line content for a PR merged event
 */
export declare function buildMergedEntry(ctx: PREventContext): string;
/**
 * Generate the log line for a PR closed (without merge) event
 */
export declare function buildClosedEntry(ctx: PREventContext): string;
/**
 * Generate ACTIVITY.md log entries for a PR event.
 * Dispatches to the appropriate builder based on event type.
 */
export declare function generateActivityEntries(ctx: PREventContext): ActivityLoggingResult;
export { generateActivityEntries as default };
//# sourceMappingURL=activity-logging.d.ts.map