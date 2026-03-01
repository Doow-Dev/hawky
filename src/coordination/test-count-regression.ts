/**
 * Test Count Regression Detection (S043)
 *
 * Detects if the number of tests has decreased compared to the base branch.
 * Parses jest output or test file counts to compare.
 *
 * Output: WARN tier finding.
 */

// ============================================================================
// Types
// ============================================================================

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
        data: { content?: string; encoding?: string } | Array<{ name: string; path: string; type: string }>;
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
          tree: Array<{ path?: string; type?: string; sha?: string }>;
        };
      }>;
      getRef(params: {
        owner: string;
        repo: string;
        ref: string;
      }): Promise<{
        data: { object: { sha: string } };
      }>;
      getCommit(params: {
        owner: string;
        repo: string;
        commit_sha: string;
      }): Promise<{
        data: { tree: { sha: string } };
      }>;
    };
  };
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Test file patterns to detect test files
 */
export const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /__tests__\/.*\.(ts|tsx|js|jsx)$/,
];

/**
 * Patterns that identify individual test cases within a file
 */
export const TEST_CASE_PATTERNS = [
  /^\s*(it|test)\s*\(/gm,
  /^\s*(it|test)\.(only|skip|each)\s*\(/gm,
];

/**
 * Check if a file path is a test file
 */
export function isTestFile(path: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Count test cases in file content by counting it/test blocks
 */
export function countTestCasesInContent(content: string): number {
  let count = 0;
  for (const pattern of TEST_CASE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      count += matches.length;
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  return count;
}

/**
 * Decode base64 content from GitHub API
 */
export function decodeBase64Content(encoded: string): string {
  return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf-8');
}

/**
 * Get all test files in a branch via the git tree API
 */
export async function getTestFilesInBranch(
  octokit: TestCountOctokitLike,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  // Get the branch ref
  const refResponse = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const commitSha = refResponse.data.object.sha;

  // Get the commit to find the tree SHA
  const commitResponse = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  });
  const treeSha = commitResponse.data.tree.sha;

  // Get the full tree recursively
  const treeResponse = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: treeSha,
    recursive: '1',
  });

  return treeResponse.data.tree
    .filter((item) => item.type === 'blob' && item.path && isTestFile(item.path))
    .map((item) => item.path as string);
}

/**
 * Count total tests in a branch by reading all test files
 */
export async function countTestsInBranch(
  octokit: TestCountOctokitLike,
  owner: string,
  repo: string,
  branch: string
): Promise<TestCountSnapshot> {
  const testFiles = await getTestFilesInBranch(octokit, owner, repo, branch);

  let totalTests = 0;

  for (const filePath of testFiles) {
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      });

      const data = response.data as { content?: string; encoding?: string };
      if (data.content && data.encoding === 'base64') {
        const content = decodeBase64Content(data.content);
        totalTests += countTestCasesInContent(content);
      }
    } catch {
      // Skip files we can't read
    }
  }

  return {
    totalTests,
    testFiles: testFiles.length,
    branch,
  };
}

/**
 * Detect test count regression between branch and base branch.
 *
 * Compares total test count on the PR branch vs the base branch.
 * Flags if branch has fewer tests than base.
 */
export async function detectTestCountRegression(
  options: TestCountRegressionOptions
): Promise<TestCountRegressionResult> {
  const { octokit, owner, repo, headBranch, baseBranch } = options;

  const [branchSnapshot, baseSnapshot] = await Promise.all([
    countTestsInBranch(octokit, owner, repo, headBranch),
    countTestsInBranch(octokit, owner, repo, baseBranch),
  ]);

  const delta = branchSnapshot.totalTests - baseSnapshot.totalTests;
  const hasRegression = delta < 0;

  let message = '';
  if (hasRegression) {
    message =
      `Test count decreased: ${baseSnapshot.totalTests} → ${branchSnapshot.totalTests}. ` +
      `Verify no tests were accidentally removed`;
  } else {
    message = `Test count: ${branchSnapshot.totalTests} (${delta >= 0 ? '+' : ''}${delta} from base)`;
  }

  return {
    hasRegression,
    branchCount: branchSnapshot.totalTests,
    baseCount: baseSnapshot.totalTests,
    delta,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format test count regression result as a PR comment section
 */
export function formatTestCountRegressionWarning(
  result: TestCountRegressionResult
): string {
  if (!result.hasRegression) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:warning: **Test Count Regression** — ${result.baseCount} → ${result.branchCount} (${result.delta})</summary>`
  );
  lines.push('');
  lines.push(result.message + '.');
  lines.push('');
  lines.push('**What to check:**');
  lines.push('- Were test files accidentally deleted?');
  lines.push('- Were `it`/`test` blocks removed without equivalent replacements?');
  lines.push('- Were tests moved to a different file (and counted correctly)?');
  lines.push('');
  lines.push('*This is a WARN — not blocking.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectTestCountRegression as default };
