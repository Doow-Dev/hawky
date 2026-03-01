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

// ============================================================================
// Types
// ============================================================================

/**
 * PR event that triggers an activity log entry
 */
export type PREvent =
  | 'opened'
  | 'merged'
  | 'closed'
  | 'review_requested'
  | 'reviewed_approved'
  | 'reviewed_changes_requested'
  | 'labeled'
  | 'unlabeled';

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

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Format a date string as YYYY-MM-DD
 */
export function formatDate(isoDate: string): string {
  return isoDate.split('T')[0] ?? '';
}

/**
 * Normalize a GitHub login to an @AgentName format.
 * Looks up known agent names, falls back to title-cased login.
 */
export function normalizeAuthorToAgent(login: string): string {
  const agentMap: Record<string, string> = {
    // Known squad agents
    'godel': '@Godel',
    'maya': '@Maya',
    'kai': '@Kai',
    'nova': '@Nova',
    'luna': '@Luna',
    'latch': '@Latch',
    'hawk': '@Hawk',
    'kern': '@Kern',
  };

  const lower = login.toLowerCase();
  return agentMap[lower] ?? `@${login}`;
}

/**
 * Extract a story ID from a branch name (S### pattern)
 */
export function extractStoryIdForActivity(branchName: string): string | null {
  const match = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/.exec(branchName);
  return match ? match[1]?.toUpperCase() ?? null : null;
}

/**
 * Generate a summary of what the PR touches
 */
export function summarizeChangedFiles(files: string[], maxFiles = 3): string {
  if (files.length === 0) return 'no files';
  if (files.length <= maxFiles) {
    return files.map((f) => f.split('/').pop() ?? f).join(', ');
  }
  const shown = files
    .slice(0, maxFiles)
    .map((f) => f.split('/').pop() ?? f)
    .join(', ');
  return `${shown} +${files.length - maxFiles} more`;
}

/**
 * Generate the log line content for a PR opened event
 */
export function buildOpenedEntry(ctx: PREventContext): string {
  const date = formatDate(ctx.date);
  const agent = normalizeAuthorToAgent(ctx.authorLogin);
  const sessionId = ctx.sessionId ?? 'hawky-auto';
  const storyId = extractStoryIdForActivity(ctx.headBranch);
  const storyRef = storyId ? ` (${storyId})` : '';
  const labelStr = ctx.labels.length > 0 ? ` [${ctx.labels.slice(0, 3).join(', ')}]` : '';
  const filesSummary = summarizeChangedFiles(ctx.changedFiles);

  return (
    `[${date}] ${agent} [session:${sessionId}]: ` +
    `Opened PR #${ctx.prNumber}${storyRef} — *${ctx.prTitle}*${labelStr} → ` +
    `[View PR](${ctx.prUrl}) · ${ctx.changedFiles.length} file(s) changed (${filesSummary})`
  );
}

/**
 * Generate the log line content for a PR reviewed event
 */
export function buildReviewedEntry(ctx: PREventContext): string {
  const date = formatDate(ctx.date);
  const reviewer = normalizeAuthorToAgent(ctx.reviewerLogin ?? ctx.authorLogin);
  const sessionId = ctx.sessionId ?? 'hawky-auto';
  const storyId = extractStoryIdForActivity(ctx.headBranch);
  const storyRef = storyId ? ` (${storyId})` : '';

  let verdictStr = '';
  if (ctx.reviewVerdict === 'approved') {
    verdictStr = ' — **LGTM** ✓';
  } else if (ctx.reviewVerdict === 'changes_requested') {
    verdictStr = ' — **Changes requested**';
  } else {
    verdictStr = ' — commented';
  }

  return (
    `[${date}] ${reviewer} [session:${sessionId}]: ` +
    `Reviewed PR #${ctx.prNumber}${storyRef} — *${ctx.prTitle}*${verdictStr} → ` +
    `[View PR](${ctx.prUrl})`
  );
}

/**
 * Generate the log line content for a PR merged event
 */
export function buildMergedEntry(ctx: PREventContext): string {
  const date = formatDate(ctx.date);
  const agent = normalizeAuthorToAgent(ctx.authorLogin);
  const sessionId = ctx.sessionId ?? 'hawky-auto';
  const storyId = extractStoryIdForActivity(ctx.headBranch);
  const storyRef = storyId ? ` (${storyId})` : '';
  const labelStr = ctx.labels.length > 0 ? ` [${ctx.labels.slice(0, 3).join(', ')}]` : '';

  return (
    `[${date}] ${agent} [session:${sessionId}]: ` +
    `Merged PR #${ctx.prNumber}${storyRef} → \`${ctx.baseBranch}\` — *${ctx.prTitle}*${labelStr} → ` +
    `[View PR](${ctx.prUrl}) · ${ctx.changedFiles.length} file(s) shipped`
  );
}

/**
 * Generate the log line for a PR closed (without merge) event
 */
export function buildClosedEntry(ctx: PREventContext): string {
  const date = formatDate(ctx.date);
  const agent = normalizeAuthorToAgent(ctx.authorLogin);
  const sessionId = ctx.sessionId ?? 'hawky-auto';
  const storyId = extractStoryIdForActivity(ctx.headBranch);
  const storyRef = storyId ? ` (${storyId})` : '';

  return (
    `[${date}] ${agent} [session:${sessionId}]: ` +
    `Closed PR #${ctx.prNumber}${storyRef} (not merged) — *${ctx.prTitle}* → ` +
    `[View PR](${ctx.prUrl})`
  );
}

/**
 * Generate ACTIVITY.md log entries for a PR event.
 * Dispatches to the appropriate builder based on event type.
 */
export function generateActivityEntries(ctx: PREventContext): ActivityLoggingResult {
  let line: string;

  switch (ctx.event) {
    case 'opened':
      line = buildOpenedEntry(ctx);
      break;
    case 'reviewed_approved':
    case 'reviewed_changes_requested':
      line = buildReviewedEntry(ctx);
      break;
    case 'merged':
      line = buildMergedEntry(ctx);
      break;
    case 'closed':
      line = buildClosedEntry(ctx);
      break;
    default:
      // Other events produce no entry
      return {
        entries: [],
        hasEntries: false,
        formattedLines: [],
      };
  }

  const entry: ActivityEntry = {
    line,
    event: ctx.event,
    prNumber: ctx.prNumber,
    date: ctx.date,
  };

  return {
    entries: [entry],
    hasEntries: true,
    formattedLines: [line],
  };
}

// ============================================================================
// Index
// ============================================================================

export { generateActivityEntries as default };
