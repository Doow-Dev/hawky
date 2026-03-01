/**
 * Story ID Validation (S046)
 *
 * Validates that a PR branch name containing an S### story ID pattern
 * corresponds to a real story in the SPRINT.md backlog.
 *
 * Severity tiers:
 * - WARN: Story ID found in branch but not in SPRINT.md
 * - BLOCK: Story ID found in branch but story is already completed/done
 * - OK: Story exists and is in-progress or backlog
 *
 * Output: WARN or BLOCK tier finding depending on story state.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Possible states of a story in SPRINT.md
 */
export type StoryStatus =
  | 'backlog'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'unknown';

/**
 * A story entry parsed from SPRINT.md
 */
export interface SprintStory {
  /** Story ID (e.g., 'S046') */
  id: string;

  /** Story description */
  description: string;

  /** Assigned owner */
  owner: string;

  /** Current status */
  status: StoryStatus;
}

/**
 * Result of story ID validation
 */
export interface StoryValidationResult {
  /** Whether the branch has a story ID pattern */
  hasBranchStoryId: boolean;

  /** The story ID extracted from the branch (null if none) */
  branchStoryId: string | null;

  /** Whether the story was found in SPRINT.md */
  storyFound: boolean;

  /** The story details if found */
  story: SprintStory | null;

  /** Validation outcome */
  outcome: 'ok' | 'warn' | 'block' | 'skip';

  /** Human-readable message */
  message: string;
}

/**
 * Options for story ID validation
 */
export interface StoryValidationOptions {
  /** Branch name to validate */
  branchName: string;

  /** Content of the SPRINT.md file */
  sprintMdContent: string;

  /**
   * Statuses that should be blocked (story already done).
   * Default: ['done']
   */
  blockStatuses?: StoryStatus[];

  /**
   * Whether to emit a WARN when story is not found in SPRINT.md.
   * Default: true
   */
  warnOnMissing?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex to extract story ID from branch name.
 * Matches patterns like: S046, S123, be-S046-description, S046-add-auth
 * Case-insensitive (S or s prefix).
 */
export const BRANCH_STORY_ID_PATTERN = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/;

/**
 * Status strings that map to "done" in various formats
 */
const DONE_STATUS_ALIASES = ['done', 'complete', 'completed', 'merged', 'shipped', 'closed'];

/**
 * Status strings that map to "in-progress"
 */
const IN_PROGRESS_STATUS_ALIASES = ['in-progress', 'in_progress', 'inprogress', 'wip', 'active', 'started'];

/**
 * Status strings that map to "review"
 */
const REVIEW_STATUS_ALIASES = ['review', 'sprint:review', 'in-review', 'pr-open', 'reviewing'];

/**
 * Status strings that map to "blocked"
 */
const BLOCKED_STATUS_ALIASES = ['blocked', 'on-hold', 'hold', 'waiting'];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Extract a story ID from a branch name.
 * Returns null if no story ID pattern is found.
 */
export function extractStoryIdFromBranch(branchName: string): string | null {
  const match = BRANCH_STORY_ID_PATTERN.exec(branchName);
  if (!match) return null;
  // Normalize to uppercase S prefix
  return match[1].toUpperCase();
}

/**
 * Normalize a raw status string from SPRINT.md to a canonical StoryStatus
 */
export function normalizeStatus(raw: string): StoryStatus {
  const normalized = raw.toLowerCase().trim();
  if (DONE_STATUS_ALIASES.some((alias) => normalized === alias)) return 'done';
  if (IN_PROGRESS_STATUS_ALIASES.some((alias) => normalized === alias)) return 'in-progress';
  if (REVIEW_STATUS_ALIASES.some((alias) => normalized === alias)) return 'review';
  if (BLOCKED_STATUS_ALIASES.some((alias) => normalized === alias)) return 'blocked';
  if (normalized === 'backlog') return 'backlog';
  return 'unknown';
}

/**
 * Parse SPRINT.md content to extract story entries.
 *
 * Handles the table format:
 * | S001 | Description | Owner | Status |
 * | S002 | Description | Owner | done |
 */
export function parseSprintMd(content: string): SprintStory[] {
  const stories: SprintStory[] = [];

  // Match markdown table rows: | S### | ... | ... | ... |
  const rowPattern = /^\|\s*(S\d{3,4})\s*\|([^|]+)\|([^|]+)\|([^|]+)\|/gim;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(content)) !== null) {
    const id = match[1].trim().toUpperCase();
    const description = match[2].trim();
    const owner = match[3].trim();
    const statusRaw = match[4].trim();

    // Skip the header row if it somehow matched
    if (id === 'STORY' || description.toLowerCase() === 'description') continue;

    stories.push({
      id,
      description,
      owner,
      status: normalizeStatus(statusRaw),
    });
  }

  return stories;
}

/**
 * Find a story by ID in a list of parsed stories
 */
export function findStoryById(stories: SprintStory[], storyId: string): SprintStory | null {
  const normalizedId = storyId.toUpperCase();
  return stories.find((s) => s.id === normalizedId) ?? null;
}

/**
 * Validate story ID for a PR branch.
 *
 * Logic:
 * 1. If branch has no S### pattern → skip (result: 'skip')
 * 2. If story not found in SPRINT.md → WARN (if warnOnMissing)
 * 3. If story is in a block status (e.g., 'done') → BLOCK
 * 4. Otherwise → OK
 */
export function validateStoryId(options: StoryValidationOptions): StoryValidationResult {
  const {
    branchName,
    sprintMdContent,
    blockStatuses = ['done'],
    warnOnMissing = true,
  } = options;

  // Step 1: Extract story ID from branch
  const branchStoryId = extractStoryIdFromBranch(branchName);
  if (!branchStoryId) {
    return {
      hasBranchStoryId: false,
      branchStoryId: null,
      storyFound: false,
      story: null,
      outcome: 'skip',
      message: `Branch '${branchName}' does not contain a story ID pattern (S###) — skipping validation`,
    };
  }

  // Step 2: Parse SPRINT.md and find the story
  const stories = parseSprintMd(sprintMdContent);
  const story = findStoryById(stories, branchStoryId);

  if (!story) {
    if (warnOnMissing) {
      return {
        hasBranchStoryId: true,
        branchStoryId,
        storyFound: false,
        story: null,
        outcome: 'warn',
        message:
          `Branch '${branchName}' references story ${branchStoryId}, ` +
          `but ${branchStoryId} was not found in SPRINT.md. ` +
          `Ensure the story exists and is properly tracked.`,
      };
    }
    return {
      hasBranchStoryId: true,
      branchStoryId,
      storyFound: false,
      story: null,
      outcome: 'ok',
      message: `Story ${branchStoryId} not found in SPRINT.md (missing check disabled)`,
    };
  }

  // Step 3: Check if story is in a blocking status
  if (blockStatuses.includes(story.status)) {
    return {
      hasBranchStoryId: true,
      branchStoryId,
      storyFound: true,
      story,
      outcome: 'block',
      message:
        `Branch '${branchName}' references story ${branchStoryId}, ` +
        `but that story is already marked as '${story.status}'. ` +
        `Is this PR for a new related change, or should it reference a different story?`,
    };
  }

  // Step 4: Story found and valid
  return {
    hasBranchStoryId: true,
    branchStoryId,
    storyFound: true,
    story,
    outcome: 'ok',
    message: `Story ${branchStoryId} found in SPRINT.md — status: ${story.status}`,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format story validation result as a PR comment section.
 * Produces output for WARN and BLOCK outcomes only.
 */
export function formatStoryValidationFinding(result: StoryValidationResult): string {
  if (result.outcome === 'ok' || result.outcome === 'skip') {
    return '';
  }

  const lines: string[] = [];

  if (result.outcome === 'block') {
    lines.push('<details>');
    lines.push(
      `<summary>:no_entry: **Story Already Completed** — ${result.branchStoryId} is marked '${result.story?.status}'</summary>`
    );
    lines.push('');
    lines.push(result.message);
    lines.push('');
    if (result.story) {
      lines.push(`**Story details:**`);
      lines.push(`- **ID:** ${result.story.id}`);
      lines.push(`- **Description:** ${result.story.description}`);
      lines.push(`- **Owner:** ${result.story.owner}`);
      lines.push(`- **Status:** ${result.story.status}`);
      lines.push('');
    }
    lines.push('*This is a BLOCK — review required before merging.*');
  } else {
    // WARN: story not found
    lines.push('<details>');
    lines.push(
      `<summary>:warning: **Story Not Found** — ${result.branchStoryId} not in SPRINT.md</summary>`
    );
    lines.push('');
    lines.push(result.message);
    lines.push('');
    lines.push('**What to check:**');
    lines.push(`- Does story ${result.branchStoryId} exist in the current sprint?`);
    lines.push('- Is SPRINT.md up to date with all planned stories?');
    lines.push('- Should this branch be renamed to match its story ID?');
    lines.push('');
    lines.push('*This is a WARN — not blocking.*');
  }

  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { validateStoryId as default };
