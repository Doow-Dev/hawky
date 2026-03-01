/**
 * Tests for Stale Branch Detection (S038)
 */

import {
  checkStaleBranch,
  formatStaleBranchWarning,
  type StaleCheckOptions,
  type StaleCheckResult,
  type StaleOctokitLike,
} from '../../src/coordination/stale-branch';

// ============================================================================
// Helpers
// ============================================================================

function createMockOctokit(
  behindBy: number,
  baseLastCommitDate?: string
): StaleOctokitLike {
  return {
    rest: {
      repos: {
        compareCommitsWithBasehead: jest.fn().mockResolvedValue({
          data: {
            behind_by: behindBy,
            base_commit: baseLastCommitDate
              ? {
                  commit: {
                    committer: { date: baseLastCommitDate },
                  },
                }
              : undefined,
          },
        }),
      },
    },
  };
}

// ============================================================================
// checkStaleBranch
// ============================================================================

describe('checkStaleBranch', () => {
  it('should return isStale=false when branch is up to date', async () => {
    const octokit = createMockOctokit(0);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.isStale).toBe(false);
    expect(result.commitsBehind).toBe(0);
  });

  it('should return isStale=false when below default threshold (50)', async () => {
    const octokit = createMockOctokit(30);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.isStale).toBe(false);
    expect(result.commitsBehind).toBe(30);
  });

  it('should return isStale=true when at default threshold (50)', async () => {
    const octokit = createMockOctokit(50);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.isStale).toBe(true);
    expect(result.commitsBehind).toBe(50);
  });

  it('should return isStale=true when above threshold', async () => {
    const octokit = createMockOctokit(75);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.isStale).toBe(true);
  });

  it('should use default threshold of 50', async () => {
    const octokit = createMockOctokit(49);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.threshold).toBe(50);
    expect(result.isStale).toBe(false);
  });

  it('should respect custom threshold', async () => {
    const octokit = createMockOctokit(20);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
      threshold: 10,
    });

    expect(result.isStale).toBe(true);
    expect(result.threshold).toBe(10);
  });

  it('should include branch names in result', async () => {
    const octokit = createMockOctokit(10);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/my-work',
      baseBranch: 'develop',
    });

    expect(result.currentBranch).toBe('feature/my-work');
    expect(result.baseBranch).toBe('develop');
  });

  it('should include base commit date when available', async () => {
    const date = '2026-02-15T10:00:00Z';
    const octokit = createMockOctokit(10, date);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.baseLastCommitDate).toBe(date);
  });

  it('should not include baseLastCommitDate when not in API response', async () => {
    const octokit = createMockOctokit(10, undefined);
    const result = await checkStaleBranch({
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(result.baseLastCommitDate).toBeUndefined();
  });

  it('should call API with correct basehead format (head...base)', async () => {
    const octokit = createMockOctokit(0);
    await checkStaleBranch({
      octokit,
      owner: 'myorg',
      repo: 'myrepo',
      headBranch: 'feature/branch',
      baseBranch: 'main',
    });

    expect(
      (octokit.rest.repos.compareCommitsWithBasehead as jest.Mock).mock.calls[0][0]
    ).toMatchObject({
      owner: 'myorg',
      repo: 'myrepo',
      basehead: 'feature/branch...main',
    });
  });

  it('should handle exact threshold boundary correctly', async () => {
    const octokit49 = createMockOctokit(49);
    const octokit50 = createMockOctokit(50);

    const result49 = await checkStaleBranch({
      octokit: octokit49,
      owner: 'o',
      repo: 'r',
      headBranch: 'h',
      baseBranch: 'main',
    });
    const result50 = await checkStaleBranch({
      octokit: octokit50,
      owner: 'o',
      repo: 'r',
      headBranch: 'h',
      baseBranch: 'main',
    });

    expect(result49.isStale).toBe(false);
    expect(result50.isStale).toBe(true);
  });
});

// ============================================================================
// formatStaleBranchWarning
// ============================================================================

describe('formatStaleBranchWarning', () => {
  function buildResult(overrides: Partial<StaleCheckResult> = {}): StaleCheckResult {
    return {
      isStale: true,
      commitsBehind: 75,
      baseBranch: 'main',
      currentBranch: 'feature/my-branch',
      threshold: 50,
      ...overrides,
    };
  }

  it('should return empty string when branch is not stale', () => {
    const result = buildResult({ isStale: false, commitsBehind: 10 });

    expect(formatStaleBranchWarning(result)).toBe('');
  });

  it('should include commits behind count', () => {
    const md = formatStaleBranchWarning(buildResult({ commitsBehind: 75 }));

    expect(md).toContain('75');
  });

  it('should include base branch name', () => {
    const md = formatStaleBranchWarning(buildResult({ baseBranch: 'develop' }));

    expect(md).toContain('develop');
  });

  it('should include current branch name', () => {
    const md = formatStaleBranchWarning(buildResult({ currentBranch: 'feature/my-work' }));

    expect(md).toContain('feature/my-work');
  });

  it('should include threshold value', () => {
    const md = formatStaleBranchWarning(buildResult({ threshold: 50 }));

    expect(md).toContain('50');
  });

  it('should include rebase instructions', () => {
    const md = formatStaleBranchWarning(buildResult());

    expect(md).toContain('git rebase');
    expect(md).toContain('git fetch origin');
  });

  it('should include rebase command targeting the base branch', () => {
    const md = formatStaleBranchWarning(buildResult({ baseBranch: 'main' }));

    expect(md).toContain('rebase origin/main');
  });

  it('should note this is a WARN (non-blocking)', () => {
    const md = formatStaleBranchWarning(buildResult());

    expect(md).toContain('WARN');
    expect(md).toContain('not blocking');
  });

  it('should include last commit date when available', () => {
    const result = buildResult({ baseLastCommitDate: '2026-01-15T12:00:00Z' });
    const md = formatStaleBranchWarning(result);

    expect(md).toContain('2026-01-15');
  });

  it('should not include date section when date not available', () => {
    const result = buildResult({ baseLastCommitDate: undefined });
    const md = formatStaleBranchWarning(result);

    expect(md).not.toContain('Last commit to');
  });

  it('should be wrapped in collapsible <details> block', () => {
    const md = formatStaleBranchWarning(buildResult());

    expect(md).toContain('<details>');
    expect(md).toContain('<summary>');
    expect(md).toContain('</details>');
  });

  it('should include hourglass icon in summary', () => {
    const md = formatStaleBranchWarning(buildResult());

    expect(md).toContain(':hourglass:');
  });

  it('should suggest dealing with potential issues', () => {
    const md = formatStaleBranchWarning(buildResult());

    expect(md.toLowerCase()).toMatch(/rebase|merge conflict|integration/);
  });
});
