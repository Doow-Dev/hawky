/**
 * Dependency Enforcement (S041)
 *
 * Blocks PR merge if its story's dependencies haven't been merged yet.
 *
 * Reads story dependencies from SPRINT.md (e.g., "Depends on S123, S124")
 * and checks GitHub PR history to see if those story branches have been
 * merged into the base branch. If a dependency hasn't been merged, blocks.
 *
 * Output: BLOCK tier finding.
 */
/**
 * A dependency that is not yet satisfied
 */
export interface UnmetDependency {
    /** Story ID of the dependency */
    storyId: string;
    /** Why it's unmet */
    reason: string;
    /** Whether we could find the story at all */
    storyFound: boolean;
}
/**
 * A dependency that is satisfied
 */
export interface MetDependency {
    /** Story ID of the dependency */
    storyId: string;
    /** The PR that satisfied it (if we found one) */
    mergedPRNumber: number | null;
}
/**
 * Result of dependency enforcement check
 */
export interface DependencyEnforcementResult {
    /** Whether any dependencies are unmet */
    hasUnmetDependencies: boolean;
    /** Unmet dependencies */
    unmetDependencies: UnmetDependency[];
    /** Met dependencies */
    metDependencies: MetDependency[];
    /** All declared dependencies */
    allDependencies: string[];
    /** Story ID of the current PR */
    storyId: string | null;
    /** Human-readable message */
    message: string;
}
/**
 * Options for dependency enforcement
 */
export interface DependencyEnforcementOptions {
    /** GitHub Octokit client */
    octokit: DependencyOctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Head branch of the current PR */
    headBranch: string;
    /** Base branch (what we're merging into) */
    baseBranch: string;
    /** SPRINT.md content to parse dependencies from */
    sprintMdContent: string;
}
/**
 * Minimal Octokit interface for dependency enforcement
 */
export interface DependencyOctokitLike {
    rest: {
        pulls: {
            list(params: {
                owner: string;
                repo: string;
                state: 'closed';
                base: string;
                per_page: number;
            }): Promise<{
                data: Array<{
                    number: number;
                    title: string;
                    head: {
                        ref: string;
                    };
                    base: {
                        ref: string;
                    };
                    merged_at: string | null;
                }>;
            }>;
        };
    };
}
/**
 * Extract story ID from a branch name
 */
export declare function extractCurrentStoryId(branchName: string): string | null;
/**
 * Parse dependency declarations from SPRINT.md for a specific story.
 *
 * Looks for patterns like:
 * - "Depends on S123"
 * - "Depends on S123, S124"
 * - "depends_on: S123"
 * - "Dependencies: S123, S124"
 * - "Blockers: S123"
 * - In table format: an extra column with dep info
 *
 * Scopes searches to the story's section (between its ### heading and the next ### heading)
 * to avoid cross-story contamination.
 */
export declare function parseDependencies(sprintMdContent: string, storyId: string): string[];
/**
 * Check if a story's branch has been merged into the base branch.
 * Looks for closed PRs whose head branch contains the story ID.
 */
export declare function checkStoryMerged(octokit: DependencyOctokitLike, owner: string, repo: string, storyId: string, baseBranch: string): Promise<{
    merged: boolean;
    prNumber: number | null;
}>;
/**
 * Enforce story dependencies for a PR.
 *
 * Algorithm:
 * 1. Extract story ID from branch name
 * 2. Parse dependencies from SPRINT.md
 * 3. For each dependency, check if its branch has been merged
 * 4. If any are unmet → BLOCK
 */
export declare function enforceDependencies(options: DependencyEnforcementOptions): Promise<DependencyEnforcementResult>;
/**
 * Format dependency enforcement result as a PR comment section.
 * Only produces output when unmet dependencies are detected.
 */
export declare function formatDependencyBlock(result: DependencyEnforcementResult): string;
export { enforceDependencies as default };
//# sourceMappingURL=dependency-enforcement.d.ts.map