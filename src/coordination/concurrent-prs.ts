/**
 * Concurrent PR Detection (S035)
 *
 * Detects other open PRs that touch the same files as the current PR.
 * Uses GitHub API to list open PRs and flags potential merge conflicts.
 *
 * Output: WARN tier findings (non-blocking) noting which PRs overlap.
 */

// ============================================================================
// Types
// ============================================================================

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
          user: { login: string } | null;
          html_url: string;
          head: { ref: string };
          base: { ref: string };
        }>;
      }>;

      listFiles(params: {
        owner: string;
        repo: string;
        pull_number: number;
        per_page: number;
      }): Promise<{
        data: Array<{ filename: string }>;
      }>;
    };
  };
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Find overlapping files between two file lists
 */
export function findOverlappingFiles(filesA: string[], filesB: string[]): string[] {
  const setA = new Set(filesA);
  return filesB.filter((f) => setA.has(f));
}

/**
 * Detect concurrent open PRs that touch the same files as the current PR.
 *
 * Algorithm:
 * 1. List all open PRs in the repo
 * 2. For each (excluding current), fetch its changed files
 * 3. Find overlap with current PR's changed files
 * 4. Return structured list of conflicts
 */
export async function detectConcurrentPRs(
  options: ConcurrentPROptions
): Promise<ConcurrentPRResult> {
  const {
    octokit,
    owner,
    repo,
    currentPRNumber,
    currentPRFiles,
    baseBranch,
    maxPRsToScan = 50,
  } = options;

  // Fetch open PRs
  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    ...(baseBranch ? { base: baseBranch } : {}),
    per_page: Math.min(maxPRsToScan, 100),
  });

  // Filter out the current PR
  const otherPRs = openPRs.filter((pr) => pr.number !== currentPRNumber);

  const conflictingPRs: ConflictingPR[] = [];
  const fileConflictMap = new Map<string, number[]>();

  // Check each other PR for file overlap
  for (const pr of otherPRs) {
    let prFiles: string[];

    try {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });
      prFiles = files.map((f) => f.filename);
    } catch {
      // If we can't fetch files for a PR, skip it
      continue;
    }

    const overlapping = findOverlappingFiles(currentPRFiles, prFiles);

    if (overlapping.length > 0) {
      conflictingPRs.push({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? 'unknown',
        url: pr.html_url,
        overlappingFiles: overlapping,
        headBranch: pr.head.ref,
      });

      // Update the file conflict map
      for (const file of overlapping) {
        const existingConflicts = fileConflictMap.get(file) ?? [];
        existingConflicts.push(pr.number);
        fileConflictMap.set(file, existingConflicts);
      }
    }
  }

  // Build overlapping files list
  const overlappingFiles: OverlappingFile[] = [];
  for (const [file, conflictPRs] of fileConflictMap) {
    overlappingFiles.push({ path: file, conflictingPRs: conflictPRs });
  }

  // Sort by number of conflicts (most conflicted files first)
  overlappingFiles.sort((a, b) => b.conflictingPRs.length - a.conflictingPRs.length);

  return {
    hasConcurrentPRs: conflictingPRs.length > 0,
    conflictingPRs,
    overlappingFiles,
    prsScanned: otherPRs.length,
    currentPRFiles,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format concurrent PR detection results as a PR comment section
 */
export function formatConcurrentPRWarning(result: ConcurrentPRResult): string {
  if (!result.hasConcurrentPRs) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:warning: **Concurrent PR Warning** — ${result.conflictingPRs.length} open PR(s) touch the same files</summary>`
  );
  lines.push('');
  lines.push(
    'The following open PRs modify files that this PR also changes. ' +
    'This may cause merge conflicts — coordinate with the authors before merging.'
  );
  lines.push('');

  for (const pr of result.conflictingPRs) {
    lines.push(`**[#${pr.number}: ${pr.title}](${pr.url})** by @${pr.author}`);
    lines.push(`Branch: \`${pr.headBranch}\``);
    lines.push('');

    if (pr.overlappingFiles.length <= 5) {
      lines.push('Shared files:');
      for (const file of pr.overlappingFiles) {
        lines.push(`- \`${file}\``);
      }
    } else {
      lines.push(
        `Shared files: ${pr.overlappingFiles.slice(0, 3).map((f) => `\`${f}\``).join(', ')} ` +
        `and ${pr.overlappingFiles.length - 3} more`
      );
    }

    lines.push('');
  }

  if (result.overlappingFiles.length > 0) {
    const hotFiles = result.overlappingFiles.filter((f) => f.conflictingPRs.length > 1);
    if (hotFiles.length > 0) {
      lines.push(`**High-contention files** (modified by 2+ concurrent PRs):`);
      for (const file of hotFiles) {
        lines.push(`- \`${file.path}\` — touched by PR(s): ${file.conflictingPRs.map((n) => `#${n}`).join(', ')}`);
      }
      lines.push('');
    }
  }

  lines.push(
    `*Scanned ${result.prsScanned} open PR(s). This is a WARN — not blocking.*`
  );
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectConcurrentPRs as default };
