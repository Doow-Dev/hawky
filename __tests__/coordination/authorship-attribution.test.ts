/**
 * Tests for Authorship Attribution (S045)
 */

import {
  tallyAuthors,
  getPrimaryAuthor,
  detectMixedAuthorship,
  formatAuthorshipAttribution,
  type AuthorshipResult,
  type AuthorshipOptions,
  type AuthorshipOctokitLike,
  type CommitAuthor,
} from '../../src/coordination/authorship-attribution';

// ============================================================================
// Mock Helpers
// ============================================================================

type MockCommit = {
  sha: string;
  author: { login: string } | null;
  commit: { author: { name: string; email: string } | null };
};

function createMockCommit(login: string | null, sha?: string): MockCommit {
  return {
    sha: sha ?? `sha-${Math.random().toString(36).slice(2)}`,
    author: login !== null ? { login } : null,
    commit: { author: { name: login ?? 'Unknown', email: `${login ?? 'unknown'}@example.com` } },
  };
}

function createMockOctokit(commits: MockCommit[]): AuthorshipOctokitLike {
  return {
    rest: {
      pulls: {
        listCommits: jest.fn().mockResolvedValue({ data: commits }),
      },
    },
  };
}

function createDefaultOptions(
  octokit: AuthorshipOctokitLike,
  overrides: Partial<AuthorshipOptions> = {}
): AuthorshipOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    prNumber: 42,
    ...overrides,
  };
}

// ============================================================================
// tallyAuthors
// ============================================================================

describe('tallyAuthors', () => {
  it('should tally single author', () => {
    const commits = [
      { login: 'alice' },
      { login: 'alice' },
      { login: 'alice' },
    ];
    const result = tallyAuthors(commits);
    expect(result).toHaveLength(1);
    expect(result[0].login).toBe('alice');
    expect(result[0].commitCount).toBe(3);
  });

  it('should tally multiple authors', () => {
    const commits = [
      { login: 'alice' },
      { login: 'bob' },
      { login: 'alice' },
      { login: 'carol' },
      { login: 'bob' },
      { login: 'alice' },
    ];
    const result = tallyAuthors(commits);
    expect(result).toHaveLength(3);

    const alice = result.find((a) => a.login === 'alice');
    const bob = result.find((a) => a.login === 'bob');
    const carol = result.find((a) => a.login === 'carol');

    expect(alice?.commitCount).toBe(3);
    expect(bob?.commitCount).toBe(2);
    expect(carol?.commitCount).toBe(1);
  });

  it('should sort by commit count descending', () => {
    const commits = [
      { login: 'carol' },
      { login: 'alice' },
      { login: 'alice' },
      { login: 'alice' },
      { login: 'bob' },
      { login: 'bob' },
    ];
    const result = tallyAuthors(commits);
    expect(result[0].login).toBe('alice');
    expect(result[1].login).toBe('bob');
    expect(result[2].login).toBe('carol');
  });

  it('should treat null login as "unknown"', () => {
    const commits = [
      { login: null },
      { login: null },
      { login: 'alice' },
    ];
    const result = tallyAuthors(commits);
    const unknown = result.find((a) => a.login === 'unknown');
    expect(unknown?.commitCount).toBe(2);
  });

  it('should return empty array for empty input', () => {
    expect(tallyAuthors([])).toHaveLength(0);
  });

  it('should handle single commit from single author', () => {
    const result = tallyAuthors([{ login: 'alice' }]);
    expect(result).toHaveLength(1);
    expect(result[0].commitCount).toBe(1);
  });
});

// ============================================================================
// getPrimaryAuthor
// ============================================================================

describe('getPrimaryAuthor', () => {
  it('should return the author with most commits', () => {
    const authors: CommitAuthor[] = [
      { login: 'alice', commitCount: 5 },
      { login: 'bob', commitCount: 2 },
    ];
    expect(getPrimaryAuthor(authors)).toBe('alice');
  });

  it('should return null for empty array', () => {
    expect(getPrimaryAuthor([])).toBeNull();
  });

  it('should return the first author when sorted (highest count)', () => {
    const authors: CommitAuthor[] = [
      { login: 'alpha', commitCount: 10 },
      { login: 'beta', commitCount: 3 },
      { login: 'gamma', commitCount: 1 },
    ];
    expect(getPrimaryAuthor(authors)).toBe('alpha');
  });

  it('should handle single author', () => {
    const authors: CommitAuthor[] = [{ login: 'solo', commitCount: 7 }];
    expect(getPrimaryAuthor(authors)).toBe('solo');
  });
});

// ============================================================================
// detectMixedAuthorship
// ============================================================================

describe('detectMixedAuthorship', () => {
  it('should return hasMixedAuthors false for single author', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('alice'),
      createMockCommit('alice'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.hasMixedAuthors).toBe(false);
    expect(result.authors).toHaveLength(1);
    expect(result.authors[0].login).toBe('alice');
    expect(result.totalCommits).toBe(3);
    expect(result.primaryAuthor).toBe('alice');
  });

  it('should return hasMixedAuthors true for multiple authors', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('bob'),
      createMockCommit('alice'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.hasMixedAuthors).toBe(true);
    expect(result.authors).toHaveLength(2);
    expect(result.totalCommits).toBe(3);
  });

  it('should identify primary author as the one with most commits', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('bob'),
      createMockCommit('bob'),
      createMockCommit('carol'),
      createMockCommit('bob'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.primaryAuthor).toBe('bob');
  });

  it('should handle commits with null author (fallback to unknown)', async () => {
    const commits = [
      createMockCommit(null),
      createMockCommit('alice'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.hasMixedAuthors).toBe(true);
    const unknownAuthor = result.authors.find((a) => a.login === 'unknown');
    expect(unknownAuthor).toBeDefined();
  });

  it('should return single-author message for sole author', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('alice'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.message).toContain('@alice');
    expect(result.message).toContain('2');
  });

  it('should return mixed author message for multiple authors', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('bob'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.message).toContain('@alice');
    expect(result.message).toContain('@bob');
    expect(result.message).toContain('2 authors');
  });

  it('should return totalCommits as actual count of commits', async () => {
    const commits = Array.from({ length: 7 }, (_, i) =>
      createMockCommit(i % 2 === 0 ? 'alice' : 'bob', `sha-${i}`)
    );
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.totalCommits).toBe(7);
  });

  it('should call listCommits with correct params', async () => {
    const commits = [createMockCommit('alice')];
    const octokit = createMockOctokit(commits);
    const options = createDefaultOptions(octokit, { prNumber: 99, owner: 'myorg', repo: 'myrepo' });
    await detectMixedAuthorship(options);

    expect(octokit.rest.pulls.listCommits).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
      pull_number: 99,
      per_page: 100,
    });
  });

  it('should handle empty commit list gracefully', async () => {
    const octokit = createMockOctokit([]);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    expect(result.hasMixedAuthors).toBe(false);
    expect(result.authors).toHaveLength(0);
    expect(result.totalCommits).toBe(0);
    expect(result.primaryAuthor).toBeNull();
  });

  it('should list all distinct authors in result', async () => {
    const commits = [
      createMockCommit('alice'),
      createMockCommit('bob'),
      createMockCommit('carol'),
      createMockCommit('alice'),
    ];
    const octokit = createMockOctokit(commits);
    const result = await detectMixedAuthorship(createDefaultOptions(octokit));

    const logins = result.authors.map((a) => a.login).sort();
    expect(logins).toEqual(['alice', 'bob', 'carol'].sort());
  });
});

// ============================================================================
// formatAuthorshipAttribution
// ============================================================================

describe('formatAuthorshipAttribution', () => {
  function makeResult(overrides: Partial<AuthorshipResult> = {}): AuthorshipResult {
    return {
      hasMixedAuthors: true,
      authors: [
        { login: 'alice', commitCount: 3 },
        { login: 'bob', commitCount: 2 },
      ],
      totalCommits: 5,
      primaryAuthor: 'alice',
      message: '2 authors across 5 commit(s): @alice (3), @bob (2)',
      ...overrides,
    };
  }

  it('should return empty string when no mixed authors', () => {
    const result = makeResult({
      hasMixedAuthors: false,
      authors: [{ login: 'alice', commitCount: 3 }],
      primaryAuthor: 'alice',
    });
    expect(formatAuthorshipAttribution(result)).toBe('');
  });

  it('should include header mentioning mixed authorship', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('Mixed Authorship');
  });

  it('should include all author logins', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('@alice');
    expect(output).toContain('@bob');
  });

  it('should include commit counts per author', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('3');
    expect(output).toContain('2');
  });

  it('should mark the primary author', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('primary');
  });

  it('should note this is INFORM, not blocking', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('INFORM');
    expect(output).toContain('no action required');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include total commit count in summary', () => {
    const result = makeResult({ totalCommits: 5 });
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('5');
  });

  it('should include mention of attribution in review', () => {
    const result = makeResult();
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('attributed');
  });

  it('should include contributor count in summary', () => {
    const result = makeResult({ authors: [
      { login: 'alice', commitCount: 3 },
      { login: 'bob', commitCount: 2 },
    ]});
    const output = formatAuthorshipAttribution(result);
    expect(output).toContain('2');
  });
});
