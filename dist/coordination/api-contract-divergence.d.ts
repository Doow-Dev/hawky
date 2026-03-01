/**
 * API Contract Divergence Detection (S036)
 *
 * Blocks a backend PR when:
 *   1. The backend PR changes API contract files (routes, controllers, openapi specs)
 *   2. A concurrent frontend PR (branch prefixed fe-*, ui-*, front-*) is open
 *      against the same base branch
 *
 * The risk: the frontend PR may be built on top of a stale API contract. Merging
 * the backend first breaks the frontend before it has a chance to adapt.
 *
 * Suppression: add `# hawk-ignore: contract-divergence — reason: <required>` to any
 * changed file's top comment block.
 *
 * Output: BLOCK tier finding.
 */
/**
 * A concurrent frontend PR detected during divergence check
 */
export interface FrontendPR {
    /** PR number */
    number: number;
    /** PR title */
    title: string;
    /** PR head branch */
    headBranch: string;
    /** PR author */
    author: string;
    /** PR HTML URL */
    url: string;
}
/**
 * Result of API contract divergence check
 */
export interface ContractDivergenceResult {
    /** Whether a divergence block should be applied */
    hasDivergence: boolean;
    /** API contract files changed in the current PR */
    contractFiles: string[];
    /** Concurrent frontend PRs found */
    frontendPRs: FrontendPR[];
    /** Whether suppression was detected in PR body or file comments */
    suppressed: boolean;
    /** Suppression reason if suppressed */
    suppressionReason: string | null;
    /** Human-readable message */
    message: string;
}
/**
 * Options for contract divergence detection
 */
export interface ContractDivergenceOptions {
    /** GitHub Octokit client */
    octokit: ContractDivergenceOctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Head branch of the current (backend) PR */
    headBranch: string;
    /** Base branch being merged into */
    baseBranch: string;
    /** Files changed in the current PR */
    changedFiles: string[];
    /** PR body text (for suppression detection) */
    prBody?: string;
    /** File content snippets for suppression detection (path → first 500 chars) */
    fileContents?: Record<string, string>;
}
/**
 * Minimal Octokit interface for contract divergence detection
 */
export interface ContractDivergenceOctokitLike {
    rest: {
        pulls: {
            list(params: {
                owner: string;
                repo: string;
                state: 'open';
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
                    user: {
                        login: string;
                    } | null;
                    html_url: string;
                }>;
            }>;
        };
    };
}
/**
 * File path patterns that indicate API contract changes on the backend
 */
export declare const API_CONTRACT_PATTERNS: RegExp[];
/**
 * Branch name patterns that identify frontend PRs
 */
export declare const FRONTEND_BRANCH_PATTERNS: RegExp[];
/**
 * Check if a file path matches any of the API contract patterns
 */
export declare function isApiContractFile(filePath: string): boolean;
/**
 * Filter a list of changed files to those that touch API contracts
 */
export declare function filterApiContractFiles(files: string[]): string[];
/**
 * Check if a branch name indicates a frontend PR
 */
export declare function isFrontendBranch(branchName: string): boolean;
/**
 * Detect suppression directive in PR body or file content snippets.
 *
 * Returns { suppressed: true, reason: string } if found, otherwise
 * { suppressed: false, reason: null }.
 */
export declare function detectSuppression(prBody: string | undefined, fileContents: Record<string, string> | undefined): {
    suppressed: boolean;
    reason: string | null;
};
/**
 * Detect API contract divergence.
 *
 * Algorithm:
 * 1. Check if any changed files are API contract files
 * 2. If none → no divergence (pass immediately)
 * 3. List all open PRs against the same base branch
 * 4. Filter for frontend PRs (fe-*, ui-*, front-*, etc.)
 * 5. If frontend PRs exist → BLOCK
 * 6. Check for suppression directive → skip block if present
 */
export declare function detectContractDivergence(options: ContractDivergenceOptions): Promise<ContractDivergenceResult>;
/**
 * Format contract divergence result as a PR comment block.
 * Returns empty string when no divergence detected.
 */
export declare function formatContractDivergenceBlock(result: ContractDivergenceResult): string;
export { detectContractDivergence as default };
//# sourceMappingURL=api-contract-divergence.d.ts.map