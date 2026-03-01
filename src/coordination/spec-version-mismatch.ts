/**
 * Spec Version Mismatch Detection (S039)
 *
 * Detects when a spec file was modified on the base branch after the
 * current branch was cut. If the spec has been updated since branch cut,
 * the PR may be implementing against a stale spec.
 *
 * Output: WARN tier finding.
 */

// ============================================================================
// Types
// ============================================================================

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
            commit: { committer: { date: string } | null };
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
            committer: { date: string } | null;
          };
        }>;
      }>;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default patterns for identifying spec/design files
 */
export const DEFAULT_SPEC_PATTERNS: RegExp[] = [
  // OpenAPI / Swagger
  /openapi\.(yaml|yml|json)$/i,
  /swagger\.(yaml|yml|json)$/i,
  // API spec files
  /api[-_]spec\.(yaml|yml|json|ts|md)$/i,
  /spec\.(yaml|yml|json)$/i,
  // Contract/schema files
  /schema\.(graphql|gql|json|yaml|yml)$/i,
  // Design docs
  /DESIGN\.(md|txt)$/i,
  /\.claude\/work\/features\/.*\.md$/i,
  // Proto files
  /\.proto$/i,
  // JSON Schema
  /\.schema\.json$/i,
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a file path looks like a spec file
 */
export function isSpecFile(
  filePath: string,
  patterns: RegExp[] = DEFAULT_SPEC_PATTERNS
): boolean {
  return patterns.some((p) => p.test(filePath));
}

/**
 * Find the merge base SHA and date between head branch and base branch.
 * This is the point where the branch was cut from base.
 */
export async function findBranchCutPoint(
  octokit: SpecMismatchOctokitLike,
  owner: string,
  repo: string,
  headBranch: string,
  baseBranch: string
): Promise<{ sha: string; date: string }> {
  const response = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseBranch,
    head: headBranch,
  });

  const mergeBase = response.data.merge_base_commit;
  const date = mergeBase.commit.committer?.date ?? new Date(0).toISOString();

  return { sha: mergeBase.sha, date };
}

/**
 * Check if a spec file has been updated on the base branch since the branch was cut.
 * Returns null if the spec is current (no updates since branch cut).
 */
export async function checkSpecStaleness(
  octokit: SpecMismatchOctokitLike,
  owner: string,
  repo: string,
  specPath: string,
  baseBranch: string,
  branchCutDate: string
): Promise<StaleSpec | null> {
  // List commits to the spec file on base branch since the branch cut date
  const { data: commits } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    path: specPath,
    sha: baseBranch,
    per_page: 1,
    since: branchCutDate,
  });

  if (commits.length === 0) {
    return null; // Spec hasn't changed since branch cut
  }

  const latestSpecCommit = commits[0];
  const specLastModifiedDate = latestSpecCommit.commit.committer?.date ?? branchCutDate;

  return {
    path: specPath,
    branchCutDate,
    specLastModifiedDate,
    specCommitSha: latestSpecCommit.sha.slice(0, 8),
    specCommitMessage: latestSpecCommit.commit.message.split('\n')[0], // first line only
  };
}

/**
 * Detect spec version mismatches for a PR.
 *
 * For each spec file provided:
 * 1. Find the merge base (branch cut point) between head and base
 * 2. Check if the spec has been updated on base since the branch was cut
 * 3. If yes → stale spec warning
 */
export async function detectSpecMismatch(
  options: SpecMismatchOptions
): Promise<SpecMismatchResult> {
  const { octokit, owner, repo, headBranch, baseBranch, specFiles } = options;

  if (specFiles.length === 0) {
    return {
      hasStaleSpecs: false,
      staleSpecs: [],
      currentSpecs: [],
      message: 'No spec files to check',
    };
  }

  // Find where the branch was cut
  const branchCut = await findBranchCutPoint(octokit, owner, repo, headBranch, baseBranch);

  // Check each spec file
  const staleSpecs: StaleSpec[] = [];
  const currentSpecs: string[] = [];

  await Promise.all(
    specFiles.map(async (specPath) => {
      try {
        const stale = await checkSpecStaleness(
          octokit,
          owner,
          repo,
          specPath,
          baseBranch,
          branchCut.date
        );
        if (stale) {
          staleSpecs.push(stale);
        } else {
          currentSpecs.push(specPath);
        }
      } catch {
        // Skip specs we can't check
        currentSpecs.push(specPath);
      }
    })
  );

  const hasStaleSpecs = staleSpecs.length > 0;

  let message: string;
  if (hasStaleSpecs) {
    const specList = staleSpecs.map((s) => s.path).join(', ');
    message =
      `${staleSpecs.length} spec file(s) were updated on ${baseBranch} after this branch was cut: ${specList}. ` +
      `Verify the implementation reflects the latest spec.`;
  } else {
    message = `All ${specFiles.length} spec file(s) are current — no updates since branch cut.`;
  }

  return {
    hasStaleSpecs,
    staleSpecs,
    currentSpecs,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format spec mismatch result as a PR comment section.
 * Only produces output when stale specs are detected.
 */
export function formatSpecMismatchWarning(result: SpecMismatchResult): string {
  if (!result.hasStaleSpecs) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:warning: **Stale Spec** — ${result.staleSpecs.length} spec file(s) updated after branch cut</summary>`
  );
  lines.push('');
  lines.push(
    'The following spec file(s) were modified on the base branch after this branch was created. ' +
    'This PR may be implementing against an outdated spec.'
  );
  lines.push('');

  for (const spec of result.staleSpecs) {
    lines.push(`**\`${spec.path}\`**`);
    lines.push(`- Branch cut: \`${spec.branchCutDate}\``);
    lines.push(`- Spec updated: \`${spec.specLastModifiedDate}\` (commit \`${spec.specCommitSha}\`)`);
    lines.push(`- Latest change: *${spec.specCommitMessage}*`);
    lines.push('');
  }

  lines.push('**What to do:**');
  lines.push('1. Review the spec changes made after your branch was cut');
  lines.push('2. Update your implementation if the changes affect your work');
  lines.push('3. Rebase if needed to pick up the latest spec');
  lines.push('');
  lines.push('*This is a WARN — not blocking.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectSpecMismatch as default };
