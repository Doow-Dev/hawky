/**
 * Stale Branch Detection (S038)
 *
 * Detects branches that are significantly behind their base branch.
 * Configurable threshold (default: 50 commits behind).
 * WARN tier — not blocking.
 */
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
/**
 * Check if a branch is significantly behind its base branch.
 *
 * Uses GitHub's compare API to count how many commits the current
 * PR branch is behind the base branch. Also checks branch age in days.
 *
 * Flags if: > 2 days old OR > 10 commits behind (per spec S038)
 */
export declare function checkStaleBranch(options: StaleCheckOptions): Promise<StaleCheckResult>;
/**
 * Format stale branch check result as a PR comment warning
 */
export declare function formatStaleBranchWarning(result: StaleCheckResult): string;
//# sourceMappingURL=stale-branch.d.ts.map