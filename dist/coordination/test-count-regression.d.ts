/**
 * Test Count Regression Detection (S043)
 *
 * Detects if the number of tests has decreased compared to the base branch.
 * Parses jest output or test file counts to compare.
 *
 * Output: WARN tier finding.
 */
/**
 * Test count snapshot for a branch
 */
export interface TestCountSnapshot {
    /** Total number of test cases (it/test blocks) */
    totalTests: number;
    /** Number of test files */
    testFiles: number;
    /** Branch name this snapshot was taken from */
    branch: string;
}
/**
 * Result of test count regression check
 */
export interface TestCountRegressionResult {
    /** Whether a regression was detected */
    hasRegression: boolean;
    /** Test count on the current branch */
    branchCount: number;
    /** Test count on the base branch */
    baseCount: number;
    /** Difference (negative = regression) */
    delta: number;
    /** Human-readable message */
    message: string;
}
/**
 * Options for test count regression detection
 */
export interface TestCountRegressionOptions {
    /** GitHub Octokit client */
    octokit: TestCountOctokitLike;
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Head branch (PR branch) */
    headBranch: string;
    /** Base branch (e.g., 'main') */
    baseBranch: string;
    /** Files changed in the PR */
    changedFiles: string[];
}
/**
 * Minimal Octokit interface for test count checks
 */
export interface TestCountOctokitLike {
    rest: {
        repos: {
            getContent(params: {
                owner: string;
                repo: string;
                path: string;
                ref?: string;
            }): Promise<{
                data: {
                    content?: string;
                    encoding?: string;
                } | Array<{
                    name: string;
                    path: string;
                    type: string;
                }>;
            }>;
        };
        git: {
            getTree(params: {
                owner: string;
                repo: string;
                tree_sha: string;
                recursive?: string;
            }): Promise<{
                data: {
                    tree: Array<{
                        path?: string;
                        type?: string;
                        sha?: string;
                    }>;
                };
            }>;
            getRef(params: {
                owner: string;
                repo: string;
                ref: string;
            }): Promise<{
                data: {
                    object: {
                        sha: string;
                    };
                };
            }>;
            getCommit(params: {
                owner: string;
                repo: string;
                commit_sha: string;
            }): Promise<{
                data: {
                    tree: {
                        sha: string;
                    };
                };
            }>;
        };
    };
}
/**
 * Test file patterns to detect test files
 */
export declare const TEST_FILE_PATTERNS: RegExp[];
/**
 * Patterns that identify individual test cases within a file
 */
export declare const TEST_CASE_PATTERNS: RegExp[];
/**
 * Check if a file path is a test file
 */
export declare function isTestFile(path: string): boolean;
/**
 * Count test cases in file content by counting it/test blocks
 */
export declare function countTestCasesInContent(content: string): number;
/**
 * Decode base64 content from GitHub API
 */
export declare function decodeBase64Content(encoded: string): string;
/**
 * Get all test files in a branch via the git tree API
 */
export declare function getTestFilesInBranch(octokit: TestCountOctokitLike, owner: string, repo: string, branch: string): Promise<string[]>;
/**
 * Count total tests in a branch by reading all test files
 */
export declare function countTestsInBranch(octokit: TestCountOctokitLike, owner: string, repo: string, branch: string): Promise<TestCountSnapshot>;
/**
 * Detect test count regression between branch and base branch.
 *
 * Compares total test count on the PR branch vs the base branch.
 * Flags if branch has fewer tests than base.
 */
export declare function detectTestCountRegression(options: TestCountRegressionOptions): Promise<TestCountRegressionResult>;
/**
 * Format test count regression result as a PR comment section
 */
export declare function formatTestCountRegressionWarning(result: TestCountRegressionResult): string;
export { detectTestCountRegression as default };
//# sourceMappingURL=test-count-regression.d.ts.map