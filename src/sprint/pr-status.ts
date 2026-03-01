/**
 * Sprint Status on PR Open/Merge (S047 + S048)
 *
 * S047: When a PR is opened:
 *   - Apply 'sprint:review' label
 *   - Post a PR comment acknowledging the review is in progress
 *
 * S048: When a PR is merged:
 *   - Apply 'sprint:done' label
 *   - Remove 'sprint:review' label if present
 *   - Post a PR comment acknowledging completion
 *
 * Output: INFORM tier — manages GitHub labels and posts comments.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Sprint status labels used by Hawky
 */
export type SprintLabel = 'sprint:review' | 'sprint:done' | 'sprint:blocked';

/**
 * Result of applying sprint status
 */
export interface SprintStatusResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Labels applied */
  labelsApplied: string[];

  /** Labels removed */
  labelsRemoved: string[];

  /** Comment posted (if any) */
  commentPosted: boolean;

  /** Comment body text */
  commentBody: string | null;

  /** Story ID that was updated */
  storyId: string | null;

  /** Summary message */
  message: string;
}

/**
 * Options for sprint status on PR open
 */
export interface SprintStatusOpenOptions {
  /** GitHub Octokit client */
  octokit: SprintStatusOctokitLike;

  /** Repository owner */
  owner: string;

  /** Repository name */
  repo: string;

  /** PR number */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** Head branch name */
  headBranch: string;

  /** PR author login */
  authorLogin: string;

  /** Current labels on the PR */
  existingLabels?: string[];

  /** Whether to post a PR comment */
  postComment?: boolean;
}

/**
 * Options for sprint status on PR merge
 */
export interface SprintStatusMergeOptions {
  /** GitHub Octokit client */
  octokit: SprintStatusOctokitLike;

  /** Repository owner */
  owner: string;

  /** Repository name */
  repo: string;

  /** PR number */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** Head branch name */
  headBranch: string;

  /** PR author login */
  authorLogin: string;

  /** Current labels on the PR */
  existingLabels?: string[];

  /** Whether to post a PR comment */
  postComment?: boolean;
}

/**
 * Minimal Octokit interface for sprint status operations
 */
export interface SprintStatusOctokitLike {
  rest: {
    issues: {
      addLabels(params: {
        owner: string;
        repo: string;
        issue_number: number;
        labels: string[];
      }): Promise<{ data: unknown }>;

      removeLabel(params: {
        owner: string;
        repo: string;
        issue_number: number;
        name: string;
      }): Promise<{ data: unknown }>;

      createComment(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<{ data: { id: number; html_url: string } }>;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

export const SPRINT_LABEL_REVIEW = 'sprint:review';
export const SPRINT_LABEL_DONE = 'sprint:done';
export const SPRINT_LABEL_BLOCKED = 'sprint:blocked';

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Extract story ID from branch name
 */
export function extractStoryId(branchName: string): string | null {
  const match = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/.exec(branchName);
  return match ? match[1]?.toUpperCase() ?? null : null;
}

/**
 * Build the PR comment for when a PR is opened (review in progress)
 */
export function buildOpenPRComment(options: {
  prNumber: number;
  prTitle: string;
  storyId: string | null;
  authorLogin: string;
}): string {
  const { prNumber, prTitle, storyId, authorLogin } = options;
  const storyRef = storyId ? ` for story **${storyId}**` : '';

  const lines: string[] = [
    `## Hawky Sprint Status`,
    ``,
    `PR #${prNumber}${storyRef} is now **in review**.`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **PR** | ${prTitle} |`,
    `| **Author** | @${authorLogin} |`,
    `| **Status** | \`sprint:review\` |`,
    ...(storyId ? [`| **Story** | ${storyId} |`] : []),
    ``,
    `*Hawky has labeled this PR as \`sprint:review\`. Waiting for @Hawk review and PM confirmation.*`,
  ];

  return lines.join('\n');
}

/**
 * Build the PR comment for when a PR is merged (done)
 */
export function buildMergePRComment(options: {
  prNumber: number;
  prTitle: string;
  storyId: string | null;
  authorLogin: string;
}): string {
  const { prNumber, prTitle, storyId, authorLogin } = options;
  const storyRef = storyId ? ` for story **${storyId}**` : '';

  const lines: string[] = [
    `## Hawky Sprint Status`,
    ``,
    `PR #${prNumber}${storyRef} has been **merged** — story marked as done.`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **PR** | ${prTitle} |`,
    `| **Author** | @${authorLogin} |`,
    `| **Status** | \`sprint:done\` |`,
    ...(storyId ? [`| **Story** | ${storyId} |`] : []),
    ``,
    `*Hawky has labeled this PR as \`sprint:done\`. Great work!*`,
  ];

  return lines.join('\n');
}

/**
 * Apply sprint:review status when a PR is opened.
 *
 * 1. Add 'sprint:review' label
 * 2. Post a PR comment (if postComment is true)
 */
export async function applyPROpenedStatus(
  options: SprintStatusOpenOptions
): Promise<SprintStatusResult> {
  const {
    octokit,
    owner,
    repo,
    prNumber,
    prTitle,
    headBranch,
    authorLogin,
    existingLabels = [],
    postComment = true,
  } = options;

  const storyId = extractStoryId(headBranch);
  const labelsApplied: string[] = [];
  const labelsRemoved: string[] = [];
  let commentPosted = false;
  let commentBody: string | null = null;

  // Add sprint:review label if not already present
  if (!existingLabels.includes(SPRINT_LABEL_REVIEW)) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [SPRINT_LABEL_REVIEW],
    });
    labelsApplied.push(SPRINT_LABEL_REVIEW);
  }

  // Post PR comment
  if (postComment) {
    commentBody = buildOpenPRComment({ prNumber, prTitle, storyId, authorLogin });
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
    commentPosted = true;
  }

  return {
    success: true,
    labelsApplied,
    labelsRemoved,
    commentPosted,
    commentBody,
    storyId,
    message: `PR #${prNumber} marked as sprint:review${storyId ? ` (${storyId})` : ''}`,
  };
}

/**
 * Apply sprint:done status when a PR is merged.
 *
 * 1. Add 'sprint:done' label
 * 2. Remove 'sprint:review' label if present
 * 3. Post a PR comment (if postComment is true)
 */
export async function applyPRMergedStatus(
  options: SprintStatusMergeOptions
): Promise<SprintStatusResult> {
  const {
    octokit,
    owner,
    repo,
    prNumber,
    prTitle,
    headBranch,
    authorLogin,
    existingLabels = [],
    postComment = true,
  } = options;

  const storyId = extractStoryId(headBranch);
  const labelsApplied: string[] = [];
  const labelsRemoved: string[] = [];
  let commentPosted = false;
  let commentBody: string | null = null;

  // Add sprint:done label
  if (!existingLabels.includes(SPRINT_LABEL_DONE)) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [SPRINT_LABEL_DONE],
    });
    labelsApplied.push(SPRINT_LABEL_DONE);
  }

  // Remove sprint:review label if present
  if (existingLabels.includes(SPRINT_LABEL_REVIEW)) {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: SPRINT_LABEL_REVIEW,
    });
    labelsRemoved.push(SPRINT_LABEL_REVIEW);
  }

  // Post PR comment
  if (postComment) {
    commentBody = buildMergePRComment({ prNumber, prTitle, storyId, authorLogin });
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
    commentPosted = true;
  }

  return {
    success: true,
    labelsApplied,
    labelsRemoved,
    commentPosted,
    commentBody,
    storyId,
    message: `PR #${prNumber} marked as sprint:done${storyId ? ` (${storyId})` : ''}`,
  };
}

// ============================================================================
// Index
// ============================================================================

export {
  applyPROpenedStatus as applyOpenedStatus,
  applyPRMergedStatus as applyMergedStatus,
};
