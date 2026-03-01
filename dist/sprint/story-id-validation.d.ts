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
/**
 * Possible states of a story in SPRINT.md
 */
export type StoryStatus = 'backlog' | 'in-progress' | 'review' | 'done' | 'blocked' | 'unknown';
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
/**
 * Regex to extract story ID from branch name.
 * Matches patterns like: S046, S123, be-S046-description, S046-add-auth
 * Case-insensitive (S or s prefix).
 */
export declare const BRANCH_STORY_ID_PATTERN: RegExp;
/**
 * Extract a story ID from a branch name.
 * Returns null if no story ID pattern is found.
 */
export declare function extractStoryIdFromBranch(branchName: string): string | null;
/**
 * Normalize a raw status string from SPRINT.md to a canonical StoryStatus
 */
export declare function normalizeStatus(raw: string): StoryStatus;
/**
 * Parse SPRINT.md content to extract story entries.
 *
 * Handles the table format:
 * | S001 | Description | Owner | Status |
 * | S002 | Description | Owner | done |
 */
export declare function parseSprintMd(content: string): SprintStory[];
/**
 * Find a story by ID in a list of parsed stories
 */
export declare function findStoryById(stories: SprintStory[], storyId: string): SprintStory | null;
/**
 * Validate story ID for a PR branch.
 *
 * Logic:
 * 1. If branch has no S### pattern → skip (result: 'skip')
 * 2. If story not found in SPRINT.md → WARN (if warnOnMissing)
 * 3. If story is in a block status (e.g., 'done') → BLOCK
 * 4. Otherwise → OK
 */
export declare function validateStoryId(options: StoryValidationOptions): StoryValidationResult;
/**
 * Format story validation result as a PR comment section.
 * Produces output for WARN and BLOCK outcomes only.
 */
export declare function formatStoryValidationFinding(result: StoryValidationResult): string;
export { validateStoryId as default };
//# sourceMappingURL=story-id-validation.d.ts.map