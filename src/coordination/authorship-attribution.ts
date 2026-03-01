/**
 * Authorship Attribution (S045)
 *
 * Detects mixed commit authors in a PR and emits an INFORM finding.
 * When commits come from multiple different GitHub logins, flags it so
 * co-authors are properly attributed in review discussion.
 *
 * Output: INFORM tier finding (not a warning, not blocking).
 */

// ============================================================================
// Types
// ============================================================================

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
          author: { login: string } | null;
          commit: {
            author: { name: string; email: string } | null;
          };
          sha: string;
        }>;
      }>;
    };
  };
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Tally commit counts per author login
 */
export function tallyAuthors(
  commits: Array<{ login: string | null }>
): CommitAuthor[] {
  const counts = new Map<string, number>();

  for (const commit of commits) {
    const login = commit.login ?? 'unknown';
    counts.set(login, (counts.get(login) ?? 0) + 1);
  }

  // Sort by commit count descending
  return Array.from(counts.entries())
    .map(([login, commitCount]) => ({ login, commitCount }))
    .sort((a, b) => b.commitCount - a.commitCount);
}

/**
 * Determine the primary author (most commits)
 */
export function getPrimaryAuthor(authors: CommitAuthor[]): string | null {
  if (authors.length === 0) return null;
  return authors[0]?.login ?? null;
}

/**
 * Check authorship attribution for a PR.
 *
 * Fetches all commits on the PR and checks if multiple GitHub users
 * authored them. This is informational — useful for attribution in
 * review comments and ensuring co-authors are acknowledged.
 */
export async function detectMixedAuthorship(
  options: AuthorshipOptions
): Promise<AuthorshipResult> {
  const { octokit, owner, repo, prNumber } = options;

  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  // Normalize commits to author logins
  const authorEntries = commits.map((c) => ({
    login: c.author?.login ?? null,
  }));

  const authors = tallyAuthors(authorEntries);
  const totalCommits = commits.length;
  const hasMixedAuthors = authors.length > 1;
  const primaryAuthor = getPrimaryAuthor(authors);

  let message: string;
  if (!hasMixedAuthors) {
    const sole = primaryAuthor ?? 'unknown';
    message = `All ${totalCommits} commit(s) authored by @${sole}`;
  } else {
    const authorList = authors
      .map((a) => `@${a.login} (${a.commitCount})`)
      .join(', ');
    message = `${authors.length} authors across ${totalCommits} commit(s): ${authorList}`;
  }

  return {
    hasMixedAuthors,
    authors,
    totalCommits,
    primaryAuthor,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format authorship attribution result as a PR comment section.
 * Only produces output when mixed authors are detected.
 */
export function formatAuthorshipAttribution(result: AuthorshipResult): string {
  if (!result.hasMixedAuthors) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:information_source: **Mixed Authorship** — ${result.authors.length} contributors across ${result.totalCommits} commit(s)</summary>`
  );
  lines.push('');
  lines.push(
    'This PR includes commits from multiple authors. ' +
    'Ensure all contributors are properly attributed in review discussion.'
  );
  lines.push('');
  lines.push('**Contributors:**');

  for (const author of result.authors) {
    const isPrimary = author.login === result.primaryAuthor;
    const primaryTag = isPrimary ? ' *(primary)*' : '';
    lines.push(`- @${author.login} — ${author.commitCount} commit(s)${primaryTag}`);
  }

  lines.push('');
  lines.push('*This is an INFORM — no action required.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectMixedAuthorship as default };
