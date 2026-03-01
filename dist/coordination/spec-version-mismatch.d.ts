/**
 * Spec Version Mismatch Detection (S039)
 *
 * Detects when a spec file was modified on the base branch after the
 * current branch was cut. If the spec has been updated since branch cut,
 * the PR may be implementing against a stale spec.
 *
 * Output: WARN tier finding.
 */
/**
 * A spec file that has been modified after branch cut
 */
export interface StaleSpec {
    /** File path of the spec */
    path: string;
    /** Date the branch was cut (ISO string) */
    branchCutDate: string;
    /** Date the spec was last modified on base branch (ISO string) */
    specLastModifiedDate: string;
    /** Commit SHA of the latest spec change on base branch */
    specCommitSha: string;
    /** Commit message of the latest spec change */
    specCommitMessage: string;
}
/**
 * Result of spec version mismatch check
 */
export interface SpecMismatchResult {
    /** Whether any stale specs were detected */
    hasStaleSpecs: boolean;
    /** List of specs that are stale */
    staleSpecs: StaleSpec[];
    /** Spec files that are current (not stale) */
    currentSpecs: string[];
    /** Human-readable message */
    message: string;
}
/**
 * Options for spec version mismatch detection
 */
export interface SpecMismatchOptions {
    /** GitHub Octokit client */
    octokit: SpecMismatchOctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Head branch (PR branch) */
    headBranch: string;
    /** Base branch (e.g., 'main') */
    baseBranch: string;
    /** Spec file paths to check (can be globs or exact paths) */
    specFiles: string[];
    /**
     * File path patterns that identify spec files (if specFiles not provided directly).
     * Matched against all changed files.
     */
    specPatterns?: RegExp[];
}
/**
 * Minimal Octokit interface for spec mismatch checks
 */
export interface SpecMismatchOctokitLike {
    rest: {
        repos: {
            compareCommits(params: {
                owner: string;
                repo: string;
                base: string;
                head: string;
            }): Promise<{
                data: {
                    merge_base_commit: {
                        sha: string;
                        commit: {
                            committer: {
                                date: string;
                            } | null;
                        };
                    };
                };
            }>;
            listCommits(params: {
                owner: string;
                repo: string;
                path: string;
                sha: string;
                per_page: number;
                since?: string;
            }): Promise<{
                data: Array<{
                    sha: string;
                    commit: {
                        message: string;
                        committer: {
                            date: string;
                        } | null;
                    };
                }>;
            }>;
        };
    };
}
/**
 * Default patterns for identifying spec/design files
 */
export declare const DEFAULT_SPEC_PATTERNS: RegExp[];
/**
 * Check if a file path looks like a spec file
 */
export declare function isSpecFile(filePath: string, patterns?: RegExp[]): boolean;
/**
 * Find the merge base SHA and date between head branch and base branch.
 * This is the point where the branch was cut from base.
 */
export declare function findBranchCutPoint(octokit: SpecMismatchOctokitLike, owner: string, repo: string, headBranch: string, baseBranch: string): Promise<{
    sha: string;
    date: string;
}>;
/**
 * Check if a spec file has been updated on the base branch since the branch was cut.
 * Returns null if the spec is current (no updates since branch cut).
 */
export declare function checkSpecStaleness(octokit: SpecMismatchOctokitLike, owner: string, repo: string, specPath: string, baseBranch: string, branchCutDate: string): Promise<StaleSpec | null>;
/**
 * Detect spec version mismatches for a PR.
 *
 * For each spec file provided:
 * 1. Find the merge base (branch cut point) between head and base
 * 2. Check if the spec has been updated on base since the branch was cut
 * 3. If yes → stale spec warning
 */
export declare function detectSpecMismatch(options: SpecMismatchOptions): Promise<SpecMismatchResult>;
/**
 * Format spec mismatch result as a PR comment section.
 * Only produces output when stale specs are detected.
 */
export declare function formatSpecMismatchWarning(result: SpecMismatchResult): string;
export { detectSpecMismatch as default };
//# sourceMappingURL=spec-version-mismatch.d.ts.map