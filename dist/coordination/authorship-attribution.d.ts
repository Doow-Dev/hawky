/**
 * Authorship Attribution (S045)
 *
 * Detects mixed commit authors in a PR and emits an INFORM finding.
 * When commits come from multiple different GitHub logins, flags it so
 * co-authors are properly attributed in review discussion.
 *
 * Output: INFORM tier finding (not a warning, not blocking).
 */
/**
 * A commit author found in the PR
 */
export interface CommitAuthor {
    /** GitHub login of the author */
    login: string;
    /** Number of commits by this author */
    commitCount: number;
}
/**
 * Result of authorship attribution check
 */
export interface AuthorshipResult {
    /** Whether multiple authors were found */
    hasMixedAuthors: boolean;
    /** All distinct authors found */
    authors: CommitAuthor[];
    /** Total number of commits examined */
    totalCommits: number;
    /** The primary author (most commits) */
    primaryAuthor: string | null;
    /** Human-readable summary message */
    message: string;
}
/**
 * Options for authorship attribution check
 */
export interface AuthorshipOptions {
    /** GitHub Octokit client */
    octokit: AuthorshipOctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** PR number to examine */
    prNumber: number;
}
/**
 * Minimal Octokit interface for authorship attribution
 */
export interface AuthorshipOctokitLike {
    rest: {
        pulls: {
            listCommits(params: {
                owner: string;
                repo: string;
                pull_number: number;
                per_page: number;
            }): Promise<{
                data: Array<{
                    author: {
                        login: string;
                    } | null;
                    commit: {
                        author: {
                            name: string;
                            email: string;
                        } | null;
                    };
                    sha: string;
                }>;
            }>;
        };
    };
}
/**
 * Tally commit counts per author login
 */
export declare function tallyAuthors(commits: Array<{
    login: string | null;
}>): CommitAuthor[];
/**
 * Determine the primary author (most commits)
 */
export declare function getPrimaryAuthor(authors: CommitAuthor[]): string | null;
/**
 * Check authorship attribution for a PR.
 *
 * Fetches all commits on the PR and checks if multiple GitHub users
 * authored them. This is informational — useful for attribution in
 * review comments and ensuring co-authors are acknowledged.
 */
export declare function detectMixedAuthorship(options: AuthorshipOptions): Promise<AuthorshipResult>;
/**
 * Format authorship attribution result as a PR comment section.
 * Only produces output when mixed authors are detected.
 */
export declare function formatAuthorshipAttribution(result: AuthorshipResult): string;
export { detectMixedAuthorship as default };
//# sourceMappingURL=authorship-attribution.d.ts.map