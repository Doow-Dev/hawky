/**
 * Tests for Spec Version Mismatch Detection (S039)
 */

import {
  isSpecFile,
  findBranchCutPoint,
  checkSpecStaleness,
  detectSpecMismatch,
  formatSpecMismatchWarning,
  DEFAULT_SPEC_PATTERNS,
  type SpecMismatchResult,
  type SpecMismatchOptions,
  type SpecMismatchOctokitLike,
  type StaleSpec,
} from '../../src/coordination/spec-version-mismatch';

// ============================================================================
// Mock Helpers
// ============================================================================

type MockCommit = {
  sha: string;
  commit: {
    message: string;
    committer: { date: string } | null;
  };
};

function createMockCommit(sha: string, message: string, date: string): MockCommit {
  return { sha, commit: { message, committer: { date } } };
}

function createMockOctokit(options: {
  mergeBaseSha?: string;
  mergeBaseDate?: string;
  commitsPerPath?: Record<string, MockCommit[]>;
  compareError?: Error;
}): SpecMismatchOctokitLike {
  const {
    mergeBaseSha = 'merge-base-sha',
    mergeBaseDate = '2024-01-01T00:00:00Z',
    commitsPerPath = {},
    compareError,
  } = options;

  return {
    rest: {
      repos: {
        compareCommits: jest.fn().mockImplementation(() => {
          if (compareError) return Promise.reject(compareError);
          return Promise.resolve({
            data: {
              merge_base_commit: {
                sha: mergeBaseSha,
                commit: { committer: { date: mergeBaseDate } },
              },
            },
          });
        }),
        listCommits: jest.fn().mockImplementation(
          ({ path }: { path: string; owner: string; repo: string; sha: string; per_page: number; since?: string }) => {
            const commits = commitsPerPath[path] ?? [];
            return Promise.resolve({ data: commits });
          }
        ),
      },
    },
  };
}

function createDefaultOptions(
  octokit: SpecMismatchOctokitLike,
  specFiles: string[],
  overrides: Partial<SpecMismatchOptions> = {}
): SpecMismatchOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    headBranch: 'feature/my-pr',
    baseBranch: 'main',
    specFiles,
    ...overrides,
  };
}

// ============================================================================
// isSpecFile
// ============================================================================

describe('isSpecFile', () => {
  it('should detect openapi.yaml', () => {
    expect(isSpecFile('openapi.yaml')).toBe(true);
  });

  it('should detect openapi.yml', () => {
    expect(isSpecFile('openapi.yml')).toBe(true);
  });

  it('should detect openapi.json', () => {
    expect(isSpecFile('openapi.json')).toBe(true);
  });

  it('should detect swagger.yaml', () => {
    expect(isSpecFile('swagger.yaml')).toBe(true);
  });

  it('should detect api-spec.yaml files', () => {
    expect(isSpecFile('src/api-spec.yaml')).toBe(true);
  });

  it('should detect api_spec.ts files', () => {
    expect(isSpecFile('docs/api_spec.ts')).toBe(true);
  });

  it('should detect schema.graphql files', () => {
    expect(isSpecFile('src/schema.graphql')).toBe(true);
  });

  it('should detect .gql files with schema name', () => {
    expect(isSpecFile('src/schema.gql')).toBe(true);
  });

  it('should detect .proto files', () => {
    expect(isSpecFile('proto/service.proto')).toBe(true);
  });

  it('should detect .schema.json files', () => {
    expect(isSpecFile('src/user.schema.json')).toBe(true);
  });

  it('should detect DESIGN.md files', () => {
    expect(isSpecFile('docs/DESIGN.md')).toBe(true);
  });

  it('should detect feature spec files in .claude/work/features/', () => {
    expect(isSpecFile('.claude/work/features/S001-user-auth.md')).toBe(true);
  });

  it('should not detect regular source files', () => {
    expect(isSpecFile('src/auth.ts')).toBe(false);
  });

  it('should not detect package.json', () => {
    expect(isSpecFile('package.json')).toBe(false);
  });

  it('should not detect README.md', () => {
    expect(isSpecFile('README.md')).toBe(false);
  });

  it('should support custom patterns', () => {
    const customPatterns = [/my-spec\.txt$/];
    expect(isSpecFile('docs/my-spec.txt', customPatterns)).toBe(true);
    expect(isSpecFile('src/auth.ts', customPatterns)).toBe(false);
  });
});

// ============================================================================
// findBranchCutPoint
// ============================================================================

describe('findBranchCutPoint', () => {
  it('should return merge base sha and date', async () => {
    const octokit = createMockOctokit({
      mergeBaseSha: 'abc123',
      mergeBaseDate: '2024-01-15T10:00:00Z',
    });

    const result = await findBranchCutPoint(octokit, 'owner', 'repo', 'feature/my-branch', 'main');

    expect(result.sha).toBe('abc123');
    expect(result.date).toBe('2024-01-15T10:00:00Z');
  });

  it('should call compareCommits with correct params', async () => {
    const octokit = createMockOctokit({});
    await findBranchCutPoint(octokit, 'myorg', 'myrepo', 'feature/x', 'dev');

    expect(octokit.rest.repos.compareCommits).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
      base: 'dev',
      head: 'feature/x',
    });
  });

  it('should handle missing committer date with epoch fallback', async () => {
    const octokit: SpecMismatchOctokitLike = {
      rest: {
        repos: {
          compareCommits: jest.fn().mockResolvedValue({
            data: {
              merge_base_commit: {
                sha: 'abc',
                commit: { committer: null },
              },
            },
          }),
          listCommits: jest.fn(),
        },
      },
    };

    const result = await findBranchCutPoint(octokit, 'owner', 'repo', 'feature/x', 'main');
    expect(result.sha).toBe('abc');
    // Should have some date (epoch fallback)
    expect(result.date).toBeTruthy();
  });
});

// ============================================================================
// checkSpecStaleness
// ============================================================================

describe('checkSpecStaleness', () => {
  it('should return null when spec has not changed since branch cut', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: { 'openapi.yaml': [] }, // no commits since branch cut
    });

    const result = await checkSpecStaleness(
      octokit, 'owner', 'repo', 'openapi.yaml', 'main', '2024-01-01T00:00:00Z'
    );
    expect(result).toBeNull();
  });

  it('should return StaleSpec when spec was updated after branch cut', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: {
        'openapi.yaml': [
          createMockCommit('abc123def456', 'Update API endpoints\n\nMore details', '2024-01-15T10:00:00Z'),
        ],
      },
    });

    const result = await checkSpecStaleness(
      octokit, 'owner', 'repo', 'openapi.yaml', 'main', '2024-01-01T00:00:00Z'
    );

    expect(result).not.toBeNull();
    expect(result!.path).toBe('openapi.yaml');
    expect(result!.specCommitSha).toBe('abc123de'); // first 8 chars
    expect(result!.specCommitMessage).toBe('Update API endpoints'); // first line only
    expect(result!.specLastModifiedDate).toBe('2024-01-15T10:00:00Z');
    expect(result!.branchCutDate).toBe('2024-01-01T00:00:00Z');
  });

  it('should call listCommits with since param', async () => {
    const octokit = createMockOctokit({ commitsPerPath: { 'openapi.yaml': [] } });
    await checkSpecStaleness(
      octokit, 'owner', 'repo', 'openapi.yaml', 'main', '2024-01-10T00:00:00Z'
    );

    expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith(
      expect.objectContaining({ since: '2024-01-10T00:00:00Z' })
    );
  });

  it('should only take the first line of commit message', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: {
        'openapi.yaml': [
          createMockCommit('sha1', 'First line\n\nBody paragraph\nMore content', '2024-01-15T10:00:00Z'),
        ],
      },
    });

    const result = await checkSpecStaleness(
      octokit, 'owner', 'repo', 'openapi.yaml', 'main', '2024-01-01T00:00:00Z'
    );

    expect(result!.specCommitMessage).toBe('First line');
  });
});

// ============================================================================
// detectSpecMismatch
// ============================================================================

describe('detectSpecMismatch', () => {
  it('should return no stale specs when specFiles is empty', async () => {
    const octokit = createMockOctokit({});
    const options = createDefaultOptions(octokit, []);
    const result = await detectSpecMismatch(options);

    expect(result.hasStaleSpecs).toBe(false);
    expect(result.staleSpecs).toHaveLength(0);
    expect(octokit.rest.repos.compareCommits).not.toHaveBeenCalled();
  });

  it('should return no stale specs when all specs are current', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: { 'openapi.yaml': [] }, // no updates
    });

    const options = createDefaultOptions(octokit, ['openapi.yaml']);
    const result = await detectSpecMismatch(options);

    expect(result.hasStaleSpecs).toBe(false);
    expect(result.currentSpecs).toContain('openapi.yaml');
  });

  it('should detect a stale spec', async () => {
    const octokit = createMockOctokit({
      mergeBaseDate: '2024-01-01T00:00:00Z',
      commitsPerPath: {
        'openapi.yaml': [
          createMockCommit('abc123456789', 'Add new endpoint', '2024-01-15T10:00:00Z'),
        ],
      },
    });

    const options = createDefaultOptions(octokit, ['openapi.yaml']);
    const result = await detectSpecMismatch(options);

    expect(result.hasStaleSpecs).toBe(true);
    expect(result.staleSpecs).toHaveLength(1);
    expect(result.staleSpecs[0].path).toBe('openapi.yaml');
  });

  it('should detect multiple stale specs', async () => {
    const octokit = createMockOctokit({
      mergeBaseDate: '2024-01-01T00:00:00Z',
      commitsPerPath: {
        'openapi.yaml': [createMockCommit('sha1', 'Update endpoints', '2024-01-10T00:00:00Z')],
        'schema.graphql': [createMockCommit('sha2', 'Add user type', '2024-01-12T00:00:00Z')],
        'api-spec.md': [], // current
      },
    });

    const options = createDefaultOptions(octokit, ['openapi.yaml', 'schema.graphql', 'api-spec.md']);
    const result = await detectSpecMismatch(options);

    expect(result.hasStaleSpecs).toBe(true);
    expect(result.staleSpecs).toHaveLength(2);
    expect(result.currentSpecs).toHaveLength(1);
    expect(result.currentSpecs[0]).toBe('api-spec.md');
  });

  it('should include stale message with spec paths', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: {
        'openapi.yaml': [createMockCommit('sha1', 'Update', '2024-01-10T00:00:00Z')],
      },
    });

    const options = createDefaultOptions(octokit, ['openapi.yaml']);
    const result = await detectSpecMismatch(options);

    expect(result.message).toContain('openapi.yaml');
    expect(result.message).toContain('latest spec');
  });

  it('should include current message when all specs are up to date', async () => {
    const octokit = createMockOctokit({
      commitsPerPath: { 'openapi.yaml': [] },
    });

    const options = createDefaultOptions(octokit, ['openapi.yaml']);
    const result = await detectSpecMismatch(options);

    expect(result.message).toContain('current');
  });

  it('should gracefully skip specs that throw errors', async () => {
    const octokit: SpecMismatchOctokitLike = {
      rest: {
        repos: {
          compareCommits: jest.fn().mockResolvedValue({
            data: {
              merge_base_commit: {
                sha: 'base',
                commit: { committer: { date: '2024-01-01T00:00:00Z' } },
              },
            },
          }),
          listCommits: jest.fn().mockImplementation(({ path }: { path: string }) => {
            if (path === 'missing.yaml') throw new Error('Not found');
            return Promise.resolve({ data: [] });
          }),
        },
      },
    };

    const options = createDefaultOptions(octokit, ['openapi.yaml', 'missing.yaml']);
    const result = await detectSpecMismatch(options);

    // Should not throw; missing.yaml goes into currentSpecs
    expect(result.currentSpecs).toContain('missing.yaml');
    expect(result.currentSpecs).toContain('openapi.yaml');
    expect(result.hasStaleSpecs).toBe(false);
  });
});

// ============================================================================
// formatSpecMismatchWarning
// ============================================================================

describe('formatSpecMismatchWarning', () => {
  function makeSpec(overrides: Partial<StaleSpec> = {}): StaleSpec {
    return {
      path: 'openapi.yaml',
      branchCutDate: '2024-01-01T00:00:00Z',
      specLastModifiedDate: '2024-01-15T10:00:00Z',
      specCommitSha: 'abc123de',
      specCommitMessage: 'Add new API endpoint',
      ...overrides,
    };
  }

  function makeResult(overrides: Partial<SpecMismatchResult> = {}): SpecMismatchResult {
    return {
      hasStaleSpecs: true,
      staleSpecs: [makeSpec()],
      currentSpecs: [],
      message: 'Stale spec detected',
      ...overrides,
    };
  }

  it('should return empty string when no stale specs', () => {
    const result = makeResult({ hasStaleSpecs: false, staleSpecs: [] });
    expect(formatSpecMismatchWarning(result)).toBe('');
  });

  it('should include warning header', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('Stale Spec');
  });

  it('should include the spec file path', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('openapi.yaml');
  });

  it('should include branch cut and spec modified dates', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('2024-01-01T00:00:00Z');
    expect(output).toContain('2024-01-15T10:00:00Z');
  });

  it('should include the commit SHA', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('abc123de');
  });

  it('should include the commit message', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('Add new API endpoint');
  });

  it('should include remediation steps', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('What to do');
  });

  it('should note this is a WARN, not blocking', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('WARN');
    expect(output).toContain('not blocking');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should mention implementation may be against outdated spec', () => {
    const result = makeResult();
    const output = formatSpecMismatchWarning(result);
    const lower = output.toLowerCase();
    expect(lower.includes('outdated') || lower.includes('stale') || lower.includes('latest')).toBe(true);
  });

  it('should handle multiple stale specs', () => {
    const result = makeResult({
      staleSpecs: [
        makeSpec({ path: 'openapi.yaml' }),
        makeSpec({ path: 'schema.graphql', specCommitSha: 'def456ab' }),
      ],
    });
    const output = formatSpecMismatchWarning(result);
    expect(output).toContain('openapi.yaml');
    expect(output).toContain('schema.graphql');
  });
});
