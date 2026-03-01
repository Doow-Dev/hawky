/**
 * Tests for Concurrent PR Detection (S035)
 */

import {
  findOverlappingFiles,
  detectConcurrentPRs,
  formatConcurrentPRWarning,
  type ConcurrentPROptions,
  type ConcurrentPRResult,
  type OctokitLike,
} from '../../src/coordination/concurrent-prs';

// ============================================================================
// Mock Octokit
// ============================================================================

type MockPR = {
  number: number;
  title: string;
  user: { login: string };
  html_url: string;
  head: { ref: string };
  base: { ref: string };
};

type MockFile = { filename: string };

function createMockOctokit(
  prs: MockPR[],
  filesPerPR: Record<number, MockFile[]>
): OctokitLike {
  return {
    rest: {
      pulls: {
        list: jest.fn().mockResolvedValue({ data: prs }),
        listFiles: jest.fn().mockImplementation(
          ({ pull_number }: { pull_number: number }) => {
            const files = filesPerPR[pull_number] ?? [];
            return Promise.resolve({ data: files });
          }
        ),
      },
    },
  };
}

function createMockPR(number: number, title: string, headBranch = `feature-${number}`): MockPR {
  return {
    number,
    title,
    user: { login: `user-${number}` },
    html_url: `https://github.com/owner/repo/pull/${number}`,
    head: { ref: headBranch },
    base: { ref: 'main' },
  };
}

function createDefaultOptions(
  octokit: OctokitLike,
  currentPRFiles: string[],
  overrides: Partial<ConcurrentPROptions> = {}
): ConcurrentPROptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    currentPRNumber: 100,
    currentPRFiles,
    ...overrides,
  };
}

// ============================================================================
// findOverlappingFiles
// ============================================================================

describe('findOverlappingFiles', () => {
  it('should find overlapping files', () => {
    const filesA = ['src/auth.ts', 'src/utils.ts', 'src/api.ts'];
    const filesB = ['src/auth.ts', 'src/db.ts', 'src/utils.ts'];

    const overlap = findOverlappingFiles(filesA, filesB);

    expect(overlap).toContain('src/auth.ts');
    expect(overlap).toContain('src/utils.ts');
    expect(overlap).not.toContain('src/api.ts');
    expect(overlap).not.toContain('src/db.ts');
  });

  it('should return empty when no overlap', () => {
    const filesA = ['src/auth.ts'];
    const filesB = ['src/api.ts'];

    expect(findOverlappingFiles(filesA, filesB)).toHaveLength(0);
  });

  it('should handle empty arrays', () => {
    expect(findOverlappingFiles([], ['src/api.ts'])).toHaveLength(0);
    expect(findOverlappingFiles(['src/api.ts'], [])).toHaveLength(0);
    expect(findOverlappingFiles([], [])).toHaveLength(0);
  });

  it('should be case-sensitive', () => {
    const filesA = ['src/Auth.ts'];
    const filesB = ['src/auth.ts'];

    expect(findOverlappingFiles(filesA, filesB)).toHaveLength(0);
  });
});

// ============================================================================
// detectConcurrentPRs
// ============================================================================

describe('detectConcurrentPRs', () => {
  it('should return no conflicts when no other PRs', async () => {
    const octokit = createMockOctokit([], {});
    const options = createDefaultOptions(octokit, ['src/auth.ts']);

    const result = await detectConcurrentPRs(options);

    expect(result.hasConcurrentPRs).toBe(false);
    expect(result.conflictingPRs).toHaveLength(0);
    expect(result.prsScanned).toBe(0);
  });

  it('should exclude the current PR from results', async () => {
    const prs = [createMockPR(100, 'Current PR'), createMockPR(101, 'Other PR')];
    const filesPerPR: Record<number, MockFile[]> = {
      100: [{ filename: 'src/auth.ts' }],
      101: [{ filename: 'src/other.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts']);

    const result = await detectConcurrentPRs(options);

    // PR 100 is current — should not appear in conflictingPRs
    expect(result.conflictingPRs.every((pr) => pr.number !== 100)).toBe(true);
    expect(result.prsScanned).toBe(1); // Only PR 101 scanned
  });

  it('should detect overlapping files with another PR', async () => {
    const prs = [createMockPR(101, 'Feature PR by Bob')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }, { filename: 'src/utils.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const currentFiles = ['src/auth.ts', 'src/api.ts'];
    const options = createDefaultOptions(octokit, currentFiles);

    const result = await detectConcurrentPRs(options);

    expect(result.hasConcurrentPRs).toBe(true);
    expect(result.conflictingPRs).toHaveLength(1);
    expect(result.conflictingPRs[0]?.number).toBe(101);
    expect(result.conflictingPRs[0]?.title).toBe('Feature PR by Bob');
    expect(result.conflictingPRs[0]?.overlappingFiles).toContain('src/auth.ts');
    expect(result.conflictingPRs[0]?.overlappingFiles).not.toContain('src/utils.ts');
  });

  it('should not flag PRs with no overlapping files', async () => {
    const prs = [createMockPR(101, 'Non-conflicting PR')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/unrelated.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts']);

    const result = await detectConcurrentPRs(options);

    expect(result.hasConcurrentPRs).toBe(false);
    expect(result.conflictingPRs).toHaveLength(0);
  });

  it('should detect multiple conflicting PRs', async () => {
    const prs = [createMockPR(101, 'PR A'), createMockPR(102, 'PR B')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }],
      102: [{ filename: 'src/auth.ts' }, { filename: 'src/api.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts', 'src/api.ts']);

    const result = await detectConcurrentPRs(options);

    expect(result.conflictingPRs).toHaveLength(2);
  });

  it('should build overlapping files map with all conflicting PRs', async () => {
    const prs = [createMockPR(101, 'PR A'), createMockPR(102, 'PR B')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }],
      102: [{ filename: 'src/auth.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts']);

    const result = await detectConcurrentPRs(options);

    // src/auth.ts is touched by both PR 101 and PR 102
    const authFile = result.overlappingFiles.find((f) => f.path === 'src/auth.ts');
    expect(authFile).toBeDefined();
    expect(authFile?.conflictingPRs).toContain(101);
    expect(authFile?.conflictingPRs).toContain(102);
  });

  it('should include PR metadata (author, URL, branch)', async () => {
    const prs = [createMockPR(101, 'PR by Alice', 'alice/feature')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts']);

    const result = await detectConcurrentPRs(options);

    const pr = result.conflictingPRs[0]!;
    expect(pr.author).toBe('user-101');
    expect(pr.url).toContain('pull/101');
    expect(pr.headBranch).toBe('alice/feature');
  });

  it('should skip PR if listFiles throws', async () => {
    const prs = [createMockPR(101, 'Failing PR'), createMockPR(102, 'Good PR')];
    const octokit: OctokitLike = {
      rest: {
        pulls: {
          list: jest.fn().mockResolvedValue({ data: prs }),
          listFiles: jest.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
            if (pull_number === 101) {
              return Promise.reject(new Error('API error'));
            }
            return Promise.resolve({ data: [{ filename: 'src/auth.ts' }] });
          }),
        },
      },
    };

    const options = createDefaultOptions(octokit, ['src/auth.ts']);
    const result = await detectConcurrentPRs(options);

    // PR 101 was skipped, PR 102 conflict detected
    expect(result.conflictingPRs.every((pr) => pr.number !== 101)).toBe(true);
    expect(result.conflictingPRs).toHaveLength(1);
  });

  it('should filter by base branch when specified', async () => {
    const prs = [createMockPR(101, 'PR targeting dev')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts'], { baseBranch: 'main' });

    await detectConcurrentPRs(options);

    // Verify the list call included base branch filter
    expect((octokit.rest.pulls.list as jest.Mock).mock.calls[0][0]).toMatchObject({
      base: 'main',
    });
  });

  it('should include current PR files in result', async () => {
    const octokit = createMockOctokit([], {});
    const currentFiles = ['src/auth.ts', 'src/api.ts'];
    const options = createDefaultOptions(octokit, currentFiles);

    const result = await detectConcurrentPRs(options);

    expect(result.currentPRFiles).toEqual(currentFiles);
  });

  it('should sort overlapping files by conflict count (most conflicted first)', async () => {
    const prs = [createMockPR(101, 'PR A'), createMockPR(102, 'PR B'), createMockPR(103, 'PR C')];
    const filesPerPR: Record<number, MockFile[]> = {
      101: [{ filename: 'src/auth.ts' }, { filename: 'src/rare.ts' }],
      102: [{ filename: 'src/auth.ts' }],
      103: [{ filename: 'src/auth.ts' }],
    };
    const octokit = createMockOctokit(prs, filesPerPR);
    const options = createDefaultOptions(octokit, ['src/auth.ts', 'src/rare.ts']);

    const result = await detectConcurrentPRs(options);

    // auth.ts is touched by 3 PRs, rare.ts by only 1
    expect(result.overlappingFiles[0]?.path).toBe('src/auth.ts');
    expect(result.overlappingFiles[0]?.conflictingPRs).toHaveLength(3);
  });
});

// ============================================================================
// formatConcurrentPRWarning
// ============================================================================

describe('formatConcurrentPRWarning', () => {
  function buildResult(overrides: Partial<ConcurrentPRResult> = {}): ConcurrentPRResult {
    return {
      hasConcurrentPRs: true,
      conflictingPRs: [
        {
          number: 101,
          title: 'Add auth middleware',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/101',
          overlappingFiles: ['src/auth.ts', 'src/middleware.ts'],
          headBranch: 'alice/auth',
        },
      ],
      overlappingFiles: [
        { path: 'src/auth.ts', conflictingPRs: [101] },
        { path: 'src/middleware.ts', conflictingPRs: [101] },
      ],
      prsScanned: 5,
      currentPRFiles: ['src/auth.ts', 'src/middleware.ts', 'src/api.ts'],
      ...overrides,
    };
  }

  it('should return empty string when no concurrent PRs', () => {
    const result: ConcurrentPRResult = {
      hasConcurrentPRs: false,
      conflictingPRs: [],
      overlappingFiles: [],
      prsScanned: 5,
      currentPRFiles: ['src/auth.ts'],
    };

    expect(formatConcurrentPRWarning(result)).toBe('');
  });

  it('should include number of conflicting PRs in summary', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('1 open PR(s) touch the same files');
  });

  it('should include PR number, title, and author', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('#101');
    expect(md).toContain('Add auth middleware');
    expect(md).toContain('@alice');
  });

  it('should include overlapping file paths', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('src/auth.ts');
    expect(md).toContain('src/middleware.ts');
  });

  it('should truncate long file lists', () => {
    const result = buildResult({
      conflictingPRs: [
        {
          number: 101,
          title: 'PR',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/101',
          overlappingFiles: [
            'src/a.ts', 'src/b.ts', 'src/c.ts',
            'src/d.ts', 'src/e.ts', 'src/f.ts',
          ],
          headBranch: 'alice/feat',
        },
      ],
    });

    const md = formatConcurrentPRWarning(result);

    expect(md).toContain('and 3 more');
  });

  it('should mention PRs scanned count', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('Scanned 5 open PR(s)');
  });

  it('should note this is a WARN (non-blocking)', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('WARN');
    expect(md).toContain('not blocking');
  });

  it('should highlight hot files (touched by 2+ concurrent PRs)', () => {
    const result = buildResult({
      overlappingFiles: [
        { path: 'src/hot.ts', conflictingPRs: [101, 102] },
        { path: 'src/normal.ts', conflictingPRs: [101] },
      ],
    });

    const md = formatConcurrentPRWarning(result);

    expect(md).toContain('High-contention files');
    expect(md).toContain('src/hot.ts');
  });

  it('should be wrapped in collapsible <details> block', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('<details>');
    expect(md).toContain('<summary>');
    expect(md).toContain('</details>');
  });

  it('should include branch name for conflicting PR', () => {
    const md = formatConcurrentPRWarning(buildResult());

    expect(md).toContain('alice/auth');
  });
});
