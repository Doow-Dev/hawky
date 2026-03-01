/**
 * Concurrent PR Detection (S035)
 *
 * Detects other open PRs that touch the same files as the current PR.
 * Uses GitHub API to list open PRs and flags potential merge conflicts.
 *
 * Output: WARN tier findings (non-blocking) noting which PRs overlap.
 */
/**
 * A file touched by both the current PR and another open PR
 */
export interface OverlappingFile {
    /** File path */
    path: string;
    /** Which conflicting PRs also touch this file */
    conflictingPRs: number[];
}
/**
 * A concurrent PR that overlaps with the current PR
 */
export interface ConflictingPR {
    /** PR number */
    number: number;
    /** PR title */
    title: string;
    /** PR author */
    author: string;
    /** PR HTML URL */
    url: string;
    /** Files in this PR that overlap with the current PR */
    overlappingFiles: string[];
    /** Head branch of this PR */
    headBranch: string;
}
/**
 * Result of concurrent PR detection
 */
export interface ConcurrentPRResult {
    /** Whether any concurrent PRs were found */
    hasConcurrentPRs: boolean;
    /** All conflicting PRs found */
    conflictingPRs: ConflictingPR[];
    /** All files that are touched by multiple PRs */
    overlappingFiles: OverlappingFile[];
    /** Number of PRs scanned */
    prsScanned: number;
    /** Files in the current PR */
    currentPRFiles: string[];
}
/**
 * Options for concurrent PR detection
 */
export interface ConcurrentPROptions {
    /** GitHub Octokit client (already authenticated) */
    octokit: OctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Current PR number (to exclude from results) */
    currentPRNumber: number;
    /** Files changed in the current PR */
    currentPRFiles: string[];
    /** Base branch to filter PRs by (default: all base branches) */
    baseBranch?: string;
    /** Maximum number of PRs to scan (default: 50) */
    maxPRsToScan?: number;
}
/**
 * Minimal Octokit interface (subset we need)
 */
export interface OctokitLike {
    rest: {
        pulls: {
            list(params: {
                owner: string;
                repo: string;
                state: 'open';
                base?: string;
                per_page: number;
            }): Promise<{
                data: Array<{
                    number: number;
                    title: string;
                    user: {
                        login: string;
                    } | null;
                    html_url: string;
                    head: {
                        ref: string;
                    };
                    base: {
                        ref: string;
                    };
                }>;
            }>;
            listFiles(params: {
                owner: string;
                repo: string;
                pull_number: number;
                per_page: number;
            }): Promise<{
                data: Array<{
                    filename: string;
                }>;
            }>;
        };
    };
}
/**
 * Find overlapping files between two file lists
 */
export declare function findOverlappingFiles(filesA: string[], filesB: string[]): string[];
/**
 * Detect concurrent open PRs that touch the same files as the current PR.
 *
 * Algorithm:
 * 1. List all open PRs in the repo
 * 2. For each (excluding current), fetch its changed files
 * 3. Find overlap with current PR's changed files
 * 4. Return structured list of conflicts
 */
export declare function detectConcurrentPRs(options: ConcurrentPROptions): Promise<ConcurrentPRResult>;
/**
 * Format concurrent PR detection results as a PR comment section
 */
export declare function formatConcurrentPRWarning(result: ConcurrentPRResult): string;
export { detectConcurrentPRs as default };
//# sourceMappingURL=concurrent-prs.d.ts.map