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
            }): Promise<{
                data: unknown;
            }>;
            removeLabel(params: {
                owner: string;
                repo: string;
                issue_number: number;
                name: string;
            }): Promise<{
                data: unknown;
            }>;
            createComment(params: {
                owner: string;
                repo: string;
                issue_number: number;
                body: string;
            }): Promise<{
                data: {
                    id: number;
                    html_url: string;
                };
            }>;
        };
    };
}
export declare const SPRINT_LABEL_REVIEW = "sprint:review";
export declare const SPRINT_LABEL_DONE = "sprint:done";
export declare const SPRINT_LABEL_BLOCKED = "sprint:blocked";
/**
 * Extract story ID from branch name
 */
export declare function extractStoryId(branchName: string): string | null;
/**
 * Build the PR comment for when a PR is opened (review in progress)
 */
export declare function buildOpenPRComment(options: {
    prNumber: number;
    prTitle: string;
    storyId: string | null;
    authorLogin: string;
}): string;
/**
 * Build the PR comment for when a PR is merged (done)
 */
export declare function buildMergePRComment(options: {
    prNumber: number;
    prTitle: string;
    storyId: string | null;
    authorLogin: string;
}): string;
/**
 * Apply sprint:review status when a PR is opened.
 *
 * 1. Add 'sprint:review' label
 * 2. Post a PR comment (if postComment is true)
 */
export declare function applyPROpenedStatus(options: SprintStatusOpenOptions): Promise<SprintStatusResult>;
/**
 * Apply sprint:done status when a PR is merged.
 *
 * 1. Add 'sprint:done' label
 * 2. Remove 'sprint:review' label if present
 * 3. Post a PR comment (if postComment is true)
 */
export declare function applyPRMergedStatus(options: SprintStatusMergeOptions): Promise<SprintStatusResult>;
export { applyPROpenedStatus as applyOpenedStatus, applyPRMergedStatus as applyMergedStatus, };
//# sourceMappingURL=pr-status.d.ts.map