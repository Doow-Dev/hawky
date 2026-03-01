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

// ============================================================================
// Types
// ============================================================================

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
          head: { ref: string };
          base: { ref: string };
          user: { login: string } | null;
          html_url: string;
        }>;
      }>;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * File path patterns that indicate API contract changes on the backend
 */
export const API_CONTRACT_PATTERNS: RegExp[] = [
  // Route and controller files
  /^src\/(routes?|controllers?|endpoints?|handlers?)\//i,
  // OpenAPI / Swagger specs
  /openapi\.(yaml|yml|json)$/i,
  /swagger\.(yaml|yml|json)$/i,
  /api[-_]spec\.(yaml|yml|json)$/i,
  // GraphQL schemas
  /schema\.(graphql|gql)$/i,
  // Proto files
  /\.proto$/,
  // tRPC routers
  /src\/.*router\.[tj]s$/i,
];

/**
 * Branch name patterns that identify frontend PRs
 */
export const FRONTEND_BRANCH_PATTERNS: RegExp[] = [
  /^fe[-_/]/i,
  /^ui[-_/]/i,
  /^front(?:end)?[-_/]/i,
  /^client[-_/]/i,
  /^web[-_/]/i,
];

/**
 * Suppression comment pattern
 * Must appear as: # hawk-ignore: contract-divergence — reason: <non-empty reason>
 */
const SUPPRESSION_PATTERN =
  /hawk-ignore:\s*contract-divergence\s*[—–-]+\s*reason:\s*(.+)/i;

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a file path matches any of the API contract patterns
 */
export function isApiContractFile(filePath: string): boolean {
  return API_CONTRACT_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Filter a list of changed files to those that touch API contracts
 */
export function filterApiContractFiles(files: string[]): string[] {
  return files.filter(isApiContractFile);
}

/**
 * Check if a branch name indicates a frontend PR
 */
export function isFrontendBranch(branchName: string): boolean {
  return FRONTEND_BRANCH_PATTERNS.some((p) => p.test(branchName));
}

/**
 * Detect suppression directive in PR body or file content snippets.
 *
 * Returns { suppressed: true, reason: string } if found, otherwise
 * { suppressed: false, reason: null }.
 */
export function detectSuppression(
  prBody: string | undefined,
  fileContents: Record<string, string> | undefined
): { suppressed: boolean; reason: string | null } {
  // Check PR body
  if (prBody) {
    const m = SUPPRESSION_PATTERN.exec(prBody);
    if (m && m[1]) {
      return { suppressed: true, reason: m[1].trim() };
    }
  }

  // Check file content snippets
  if (fileContents) {
    for (const content of Object.values(fileContents)) {
      const m = SUPPRESSION_PATTERN.exec(content);
      if (m && m[1]) {
        return { suppressed: true, reason: m[1].trim() };
      }
    }
  }

  return { suppressed: false, reason: null };
}

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
export async function detectContractDivergence(
  options: ContractDivergenceOptions
): Promise<ContractDivergenceResult> {
  const {
    octokit,
    owner,
    repo,
    baseBranch,
    changedFiles,
    prBody,
    fileContents,
  } = options;

  // Step 1: find API contract files in this PR
  const contractFiles = filterApiContractFiles(changedFiles);

  if (contractFiles.length === 0) {
    return {
      hasDivergence: false,
      contractFiles: [],
      frontendPRs: [],
      suppressed: false,
      suppressionReason: null,
      message: 'No API contract files changed — divergence check skipped',
    };
  }

  // Step 2: check for suppression before doing any API calls
  const { suppressed, reason: suppressionReason } = detectSuppression(
    prBody,
    fileContents
  );

  if (suppressed) {
    return {
      hasDivergence: false,
      contractFiles,
      frontendPRs: [],
      suppressed: true,
      suppressionReason,
      message: `Contract divergence check suppressed: ${suppressionReason}`,
    };
  }

  // Step 3: list open PRs on same base branch
  let openPRs: Array<{
    number: number;
    title: string;
    head: { ref: string };
    base: { ref: string };
    user: { login: string } | null;
    html_url: string;
  }>;

  try {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      base: baseBranch,
      per_page: 100,
    });
    openPRs = data;
  } catch {
    // If API fails, conservatively flag divergence to avoid false safety
    return {
      hasDivergence: true,
      contractFiles,
      frontendPRs: [],
      suppressed: false,
      suppressionReason: null,
      message:
        'API contract files changed but could not verify concurrent frontend PRs (API error) — flagging as divergence',
    };
  }

  // Step 4: filter for frontend PRs
  const frontendPRs: FrontendPR[] = openPRs
    .filter((pr) => isFrontendBranch(pr.head.ref))
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      headBranch: pr.head.ref,
      author: pr.user?.login ?? 'unknown',
      url: pr.html_url,
    }));

  const hasDivergence = frontendPRs.length > 0;

  let message: string;
  if (hasDivergence) {
    const prList = frontendPRs.map((p) => `#${p.number} (${p.headBranch})`).join(', ');
    const fileList = contractFiles.slice(0, 3).join(', ');
    const more = contractFiles.length > 3 ? ` +${contractFiles.length - 3} more` : '';
    message =
      `API contract files changed (${fileList}${more}) while frontend PR(s) are open: ${prList}. ` +
      `The frontend may be integrating against a stale contract. ` +
      `Coordinate with the frontend team before merging, or suppress with hawk-ignore.`;
  } else {
    message = `API contract files changed but no concurrent frontend PRs detected — no divergence`;
  }

  return {
    hasDivergence,
    contractFiles,
    frontendPRs,
    suppressed: false,
    suppressionReason: null,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format contract divergence result as a PR comment block.
 * Returns empty string when no divergence detected.
 */
export function formatContractDivergenceBlock(
  result: ContractDivergenceResult
): string {
  if (!result.hasDivergence) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:no_entry: **API Contract Divergence** — ${result.frontendPRs.length} concurrent frontend PR(s) detected</summary>`
  );
  lines.push('');
  lines.push(result.message);
  lines.push('');

  lines.push('**API contract files changed in this PR:**');
  for (const f of result.contractFiles) {
    lines.push(`- \`${f}\``);
  }
  lines.push('');

  lines.push('**Concurrent frontend PRs:**');
  for (const pr of result.frontendPRs) {
    lines.push(
      `- PR #${pr.number} — [${pr.title}](${pr.url}) by @${pr.author} (\`${pr.headBranch}\`)`
    );
  }
  lines.push('');

  lines.push('**Next steps:**');
  lines.push('1. Notify the frontend team about the API changes');
  lines.push('2. Wait for the frontend PRs to be updated to use the new contract');
  lines.push('3. Or suppress with: `# hawk-ignore: contract-divergence — reason: <your reason>`');
  lines.push('');
  lines.push('*This is a BLOCK — cannot merge until frontend PRs are coordinated or suppression is added.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectContractDivergence as default };
