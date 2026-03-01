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

// ============================================================================
// Types
// ============================================================================

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
          head: { ref: string };
          base: { ref: string };
          merged_at: string | null;
        }>;
      }>;
    };
  };
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Extract story ID from a branch name
 */
export function extractCurrentStoryId(branchName: string): string | null {
  const match = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/.exec(branchName);
  return match ? match[1]?.toUpperCase() ?? null : null;
}

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
export function parseDependencies(sprintMdContent: string, storyId: string): string[] {
  const normalizedId = storyId.toUpperCase();
  const deps: Set<string> = new Set();

  // Extract the story's dedicated section (### S047 ... up to next ### or end of file)
  const sectionPattern = new RegExp(
    `###\\s+${normalizedId}\\b([\\s\\S]*?)(?=\\n###\\s+[Ss]\\d|$)`,
    'i'
  );
  const sectionMatch = sectionPattern.exec(sprintMdContent);
  const storySection = sectionMatch?.[1] ?? '';

  // Parse dependency patterns within the story section
  if (storySection) {
    // Pattern 1: "Depends on S123, S124" / "depends_on: S123" / "depends: S123"
    const dependsOnPattern = /(?:depends?(?:\s+on|_on)?|requires?|dependencies):?\s+([Ss]\d{3,4}(?:\s*,\s*[Ss]\d{3,4})*)/gi;
    let m: RegExpExecArray | null;
    while ((m = dependsOnPattern.exec(storySection)) !== null) {
      const depIds = m[1]?.match(/[Ss]\d{3,4}/g) ?? [];
      depIds.forEach((d) => deps.add(d.toUpperCase()));
    }

    // Pattern 2: "Blockers: S123" / "Deps: S123"
    const blockersPattern = /(?:blockers?|deps?):?\s+([Ss]\d{3,4}(?:\s*,\s*[Ss]\d{3,4})*)/gi;
    while ((m = blockersPattern.exec(storySection)) !== null) {
      const depIds = m[1]?.match(/[Ss]\d{3,4}/g) ?? [];
      depIds.forEach((d) => deps.add(d.toUpperCase()));
    }
  }

  // Pattern 3: Table column format "| S046 | desc | owner | status | deps: S123 |"
  // Only looks at the story's own table row — safe to scan the whole doc (row is self-contained)
  const tablePattern = new RegExp(
    `^\\|\\s*${normalizedId}\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]*?([Ss]\\d{3,4}(?:\\s*,\\s*[Ss]\\d{3,4})*)[^|]*\\|`,
    'im'
  );
  const tableMatch = tablePattern.exec(sprintMdContent);
  if (tableMatch) {
    const depIds = tableMatch[1]?.match(/[Ss]\d{3,4}/g) ?? [];
    depIds.forEach((d) => deps.add(d.toUpperCase()));
  }

  // Remove self-dependency
  deps.delete(normalizedId);

  return Array.from(deps);
}

/**
 * Check if a story's branch has been merged into the base branch.
 * Looks for closed PRs whose head branch contains the story ID.
 */
export async function checkStoryMerged(
  octokit: DependencyOctokitLike,
  owner: string,
  repo: string,
  storyId: string,
  baseBranch: string
): Promise<{ merged: boolean; prNumber: number | null }> {
  // Fetch recently closed PRs into the base branch
  const { data: closedPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'closed',
    base: baseBranch,
    per_page: 100,
  });

  // Find PRs that were merged and whose branch contains the story ID
  const storyPattern = new RegExp(
    `(?:^|[-_/])${storyId}(?:[-_/]|$)`,
    'i'
  );

  for (const pr of closedPRs) {
    if (pr.merged_at && storyPattern.test(pr.head.ref)) {
      return { merged: true, prNumber: pr.number };
    }
  }

  return { merged: false, prNumber: null };
}

/**
 * Enforce story dependencies for a PR.
 *
 * Algorithm:
 * 1. Extract story ID from branch name
 * 2. Parse dependencies from SPRINT.md
 * 3. For each dependency, check if its branch has been merged
 * 4. If any are unmet → BLOCK
 */
export async function enforceDependencies(
  options: DependencyEnforcementOptions
): Promise<DependencyEnforcementResult> {
  const {
    octokit,
    owner,
    repo,
    headBranch,
    baseBranch,
    sprintMdContent,
  } = options;

  const storyId = extractCurrentStoryId(headBranch);

  if (!storyId) {
    return {
      hasUnmetDependencies: false,
      unmetDependencies: [],
      metDependencies: [],
      allDependencies: [],
      storyId: null,
      message: `Branch '${headBranch}' has no story ID — dependency check skipped`,
    };
  }

  const allDependencies = parseDependencies(sprintMdContent, storyId);

  if (allDependencies.length === 0) {
    return {
      hasUnmetDependencies: false,
      unmetDependencies: [],
      metDependencies: [],
      allDependencies: [],
      storyId,
      message: `Story ${storyId} has no declared dependencies`,
    };
  }

  // Check each dependency
  const unmetDependencies: UnmetDependency[] = [];
  const metDependencies: MetDependency[] = [];

  await Promise.all(
    allDependencies.map(async (depId) => {
      try {
        const { merged, prNumber } = await checkStoryMerged(
          octokit,
          owner,
          repo,
          depId,
          baseBranch
        );

        if (merged) {
          metDependencies.push({ storyId: depId, mergedPRNumber: prNumber });
        } else {
          unmetDependencies.push({
            storyId: depId,
            reason: `Story ${depId} has not been merged into ${baseBranch}`,
            storyFound: false, // We just couldn't find a merged PR for it
          });
        }
      } catch {
        // If we can't check, conservatively mark as unmet
        unmetDependencies.push({
          storyId: depId,
          reason: `Could not verify if story ${depId} was merged (API error)`,
          storyFound: false,
        });
      }
    })
  );

  const hasUnmetDependencies = unmetDependencies.length > 0;

  let message: string;
  if (hasUnmetDependencies) {
    const unmet = unmetDependencies.map((d) => d.storyId).join(', ');
    message =
      `Story ${storyId} has unmet dependencies: ${unmet}. ` +
      `These must be merged into ${baseBranch} before this PR can merge.`;
  } else if (allDependencies.length > 0) {
    const met = allDependencies.join(', ');
    message = `All dependencies satisfied for ${storyId}: ${met}`;
  } else {
    message = `No dependencies to check for ${storyId}`;
  }

  return {
    hasUnmetDependencies,
    unmetDependencies,
    metDependencies,
    allDependencies,
    storyId,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format dependency enforcement result as a PR comment section.
 * Only produces output when unmet dependencies are detected.
 */
export function formatDependencyBlock(result: DependencyEnforcementResult): string {
  if (!result.hasUnmetDependencies) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:no_entry: **Unmet Dependencies** — ${result.unmetDependencies.length} dependency/dependencies not yet merged</summary>`
  );
  lines.push('');
  lines.push(result.message);
  lines.push('');

  lines.push('**Unmet dependencies:**');
  for (const dep of result.unmetDependencies) {
    lines.push(`- **${dep.storyId}** — ${dep.reason}`);
  }
  lines.push('');

  if (result.metDependencies.length > 0) {
    lines.push('**Satisfied dependencies:**');
    for (const dep of result.metDependencies) {
      const prRef = dep.mergedPRNumber ? ` (merged as PR #${dep.mergedPRNumber})` : '';
      lines.push(`- ~~${dep.storyId}~~${prRef} ✓`);
    }
    lines.push('');
  }

  lines.push('**Next steps:**');
  lines.push('1. Wait for the dependencies to be merged first');
  lines.push('2. Or remove the dependency declaration if it is no longer needed');
  lines.push('');
  lines.push('*This is a BLOCK — cannot merge until dependencies are satisfied.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { enforceDependencies as default };
