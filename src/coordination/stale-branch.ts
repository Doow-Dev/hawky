/**
 * Stale Branch Detection (S038)
 *
 * Detects branches that are significantly behind their base branch.
 * Configurable threshold (default: 50 commits behind).
 * WARN tier — not blocking.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result of stale branch check
 */
export interface StaleCheckResult {
  /** Whether the branch is stale */
  isStale: boolean;

  /** How many commits behind the base branch */
  commitsBehind: number;

  /** The base branch used for comparison */
  baseBranch: string;

  /** The current branch being checked */
  currentBranch: string;

  /** The stale threshold used (commits) */
  threshold: number;

  /** Days threshold used */
  daysThreshold: number;

  /** How many days old the branch is */
  daysOld: number;

  /** Why the branch is stale (commits, days, or both) */
  staleReason?: 'commits' | 'days' | 'both';

  /** Last commit date of the base branch (ISO string) */
  baseLastCommitDate?: string;
}

/**
 * A stale branch warning (for inclusion in reports)
 */
export interface StaleWarning {
  /** Branch name */
  branch: string;

  /** Commits behind */
  commitsBehind: number;

  /** Threshold that was exceeded */
  threshold: number;

  /** Human-readable message */
  message: string;
}

/**
 * Options for stale branch detection
 */
export interface StaleCheckOptions {
  /** GitHub Octokit client */
  octokit: StaleOctokitLike;

  /** Repository owner */
  owner: string;

  /** Repository name */
  repo: string;

  /** The head branch (PR branch) to check */
  headBranch: string;

  /** The base branch to compare against (e.g., 'main') */
  baseBranch: string;

  /** Number of commits behind to trigger WARN (default: 10 per spec) */
  threshold?: number;

  /** Number of days old to trigger WARN (default: 2 per spec) */
  daysThreshold?: number;

  /** Date when the branch was created/cut (ISO string) */
  branchCreatedAt?: string;
}

/**
 * Minimal Octokit interface for stale branch checking
 */
export interface StaleOctokitLike {
  rest: {
    repos: {
      compareCommitsWithBasehead(params: {
        owner: string;
        repo: string;
        basehead: string;
      }): Promise<{
        data: {
          behind_by: number;
          base_commit?: {
            commit?: {
              committer?: {
                date?: string;
              };
            };
          };
        };
      }>;
    };
  };
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a branch is significantly behind its base branch.
 *
 * Uses GitHub's compare API to count how many commits the current
 * PR branch is behind the base branch. Also checks branch age in days.
 *
 * Flags if: > 2 days old OR > 10 commits behind (per spec S038)
 */
export async function checkStaleBranch(
  options: StaleCheckOptions
): Promise<StaleCheckResult> {
  const {
    octokit,
    owner,
    repo,
    headBranch,
    baseBranch,
    threshold = 10, // Per spec: > 10 commits behind
    daysThreshold = 2, // Per spec: > 2 days old
    branchCreatedAt,
  } = options;

  // basehead format: "base...head" (commits in base not in head = commits behind)
  const basehead = `${headBranch}...${baseBranch}`;

  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead,
  });

  const commitsBehind = data.behind_by;
  const baseLastCommitDate = data.base_commit?.commit?.committer?.date;

  // Calculate days old
  let daysOld = 0;
  if (branchCreatedAt) {
    const branchDate = new Date(branchCreatedAt);
    const now = new Date();
    daysOld = Math.floor((now.getTime() - branchDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Determine staleness: commits OR days
  const staleByCommits = commitsBehind > threshold;
  const staleByDays = daysOld > daysThreshold;
  const isStale = staleByCommits || staleByDays;

  // Determine reason
  let staleReason: 'commits' | 'days' | 'both' | undefined;
  if (staleByCommits && staleByDays) {
    staleReason = 'both';
  } else if (staleByCommits) {
    staleReason = 'commits';
  } else if (staleByDays) {
    staleReason = 'days';
  }

  const result: StaleCheckResult = {
    isStale,
    commitsBehind,
    baseBranch,
    currentBranch: headBranch,
    threshold,
    daysThreshold,
    daysOld,
  };

  if (staleReason) {
    result.staleReason = staleReason;
  }

  if (baseLastCommitDate) {
    result.baseLastCommitDate = baseLastCommitDate;
  }

  return result;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format stale branch check result as a PR comment warning
 */
export function formatStaleBranchWarning(result: StaleCheckResult): string {
  if (!result.isStale) {
    return '';
  }

  const lines: string[] = [];

  // Build summary based on reason
  let summaryReason = '';
  if (result.staleReason === 'both') {
    summaryReason = `${result.daysOld} days old and ${result.commitsBehind} commits behind`;
  } else if (result.staleReason === 'days') {
    summaryReason = `${result.daysOld} days old`;
  } else {
    summaryReason = `${result.commitsBehind} commits behind \`${result.baseBranch}\``;
  }

  lines.push('<details>');
  lines.push(
    `<summary>:hourglass: **Stale Branch Warning** — ${summaryReason}</summary>`
  );
  lines.push('');

  // Detail message based on reason
  if (result.staleReason === 'both' || result.staleReason === 'commits') {
    lines.push(
      `Branch \`${result.currentBranch}\` is **${result.commitsBehind} commits behind** \`${result.baseBranch}\` ` +
      `(threshold: ${result.threshold}).`
    );
  }
  if (result.staleReason === 'both' || result.staleReason === 'days') {
    lines.push(
      `Branch is **${result.daysOld} days old** (threshold: ${result.daysThreshold} days).`
    );
  }
  lines.push('');
  lines.push('This may cause merge conflicts or integration issues. Consider rebasing before merging.');
  lines.push('');

  if (result.baseLastCommitDate) {
    const dateStr = result.baseLastCommitDate.slice(0, 10);
    lines.push(`*Last commit to \`${result.baseBranch}\`: ${dateStr}*`);
    lines.push('');
  }

  lines.push('```bash');
  lines.push(`# Rebase onto ${result.baseBranch}:`);
  lines.push(`git fetch origin`);
  lines.push(`git rebase origin/${result.baseBranch}`);
  lines.push('```');
  lines.push('');
  lines.push('*This is a WARN — not blocking.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}
