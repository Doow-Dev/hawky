/**
 * Tests for Test Count Regression Detection (S043)
 */

import {
  isTestFile,
  countTestCasesInContent,
  decodeBase64Content,
  getTestFilesInBranch,
  countTestsInBranch,
  detectTestCountRegression,
  formatTestCountRegressionWarning,
  TEST_FILE_PATTERNS,
  TEST_CASE_PATTERNS,
  type TestCountSnapshot,
  type TestCountRegressionResult,
  type TestCountRegressionOptions,
  type TestCountOctokitLike,
} from '../../src/coordination/test-count-regression';

// ============================================================================
// Mock Helpers
// ============================================================================

type MockTreeItem = {
  path?: string;
  type?: string;
  sha?: string;
};

type MockFileContent = {
  content?: string;
  encoding?: string;
};

function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

function createMockOctokit(options: {
  refSha?: string;
  commitTreeSha?: string;
  tree?: MockTreeItem[];
  contentsByPath?: Record<string, string>;
  getRefError?: Error;
  getCommitError?: Error;
  getTreeError?: Error;
}): TestCountOctokitLike {
  const {
    refSha = 'abc123',
    commitTreeSha = 'tree456',
    tree = [],
    contentsByPath = {},
    getRefError,
    getCommitError,
    getTreeError,
  } = options;

  return {
    rest: {
      repos: {
        getContent: jest.fn().mockImplementation(
          ({ path }: { path: string; owner: string; repo: string; ref?: string }) => {
            const content = contentsByPath[path];
            if (content === undefined) {
              return Promise.reject(new Error(`File not found: ${path}`));
            }
            return Promise.resolve({
              data: {
                content: encodeBase64(content),
                encoding: 'base64',
              } as MockFileContent,
            });
          }
        ),
      },
      git: {
        getRef: jest.fn().mockImplementation(() => {
          if (getRefError) return Promise.reject(getRefError);
          return Promise.resolve({ data: { object: { sha: refSha } } });
        }),
        getCommit: jest.fn().mockImplementation(() => {
          if (getCommitError) return Promise.reject(getCommitError);
          return Promise.resolve({ data: { tree: { sha: commitTreeSha } } });
        }),
        getTree: jest.fn().mockImplementation(() => {
          if (getTreeError) return Promise.reject(getTreeError);
          return Promise.resolve({ data: { tree } });
        }),
      },
    },
  };
}

function createDefaultRegressionOptions(
  octokit: TestCountOctokitLike,
  overrides: Partial<TestCountRegressionOptions> = {}
): TestCountRegressionOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    headBranch: 'feature/my-pr',
    baseBranch: 'main',
    changedFiles: [],
    ...overrides,
  };
}

// ============================================================================
// isTestFile
// ============================================================================

describe('isTestFile', () => {
  it('should detect .test.ts files', () => {
    expect(isTestFile('src/auth.test.ts')).toBe(true);
  });

  it('should detect .spec.ts files', () => {
    expect(isTestFile('src/api.spec.ts')).toBe(true);
  });

  it('should detect .test.js files', () => {
    expect(isTestFile('lib/utils.test.js')).toBe(true);
  });

  it('should detect .spec.js files', () => {
    expect(isTestFile('lib/helpers.spec.js')).toBe(true);
  });

  it('should detect .test.tsx files', () => {
    expect(isTestFile('src/components/Button.test.tsx')).toBe(true);
  });

  it('should detect .spec.tsx files', () => {
    expect(isTestFile('src/components/Form.spec.tsx')).toBe(true);
  });

  it('should detect .test.jsx files', () => {
    expect(isTestFile('src/App.test.jsx')).toBe(true);
  });

  it('should detect files inside __tests__ directories', () => {
    expect(isTestFile('__tests__/coordination/concurrent-prs.test.ts')).toBe(true);
  });

  it('should detect deeply nested __tests__ files', () => {
    expect(isTestFile('src/__tests__/api/auth.ts')).toBe(true);
  });

  it('should not detect regular source files', () => {
    expect(isTestFile('src/auth.ts')).toBe(false);
  });

  it('should not detect markdown files', () => {
    expect(isTestFile('README.md')).toBe(false);
  });

  it('should not detect files with "test" in directory name but not test files', () => {
    expect(isTestFile('src/test-utils/helpers.ts')).toBe(false);
  });

  it('should not detect config files', () => {
    expect(isTestFile('jest.config.js')).toBe(false);
  });

  it('should not detect test setup files that are not test files', () => {
    expect(isTestFile('src/setupTests.ts')).toBe(false);
  });
});

// ============================================================================
// countTestCasesInContent
// ============================================================================

describe('countTestCasesInContent', () => {
  it('should count it() blocks', () => {
    const content = `
it('should do thing', () => {});
it('should do other thing', () => {});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(2);
  });

  it('should count test() blocks', () => {
    const content = `
test('should do thing', () => {});
test('should do other thing', () => {});
test('should do third thing', () => {});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(3);
  });

  it('should count mixed it() and test() blocks', () => {
    const content = `
describe('MyModule', () => {
  it('should init', () => {});
  it('should process', () => {});
  test('should cleanup', () => {});
});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(3);
  });

  it('should count it.only() blocks', () => {
    const content = `
it.only('focused test', () => {});
it('regular test', () => {});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(2);
  });

  it('should count it.skip() blocks', () => {
    const content = `
it.skip('skipped test', () => {});
it('regular test', () => {});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(2);
  });

  it('should count test.each() blocks', () => {
    const content = `
test.each([1, 2, 3])('test %d', (n) => {});
test('regular test', () => {});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(2);
  });

  it('should return 0 for files with no test cases', () => {
    const content = `
export function add(a: number, b: number): number {
  return a + b;
}
    `.trim();
    expect(countTestCasesInContent(content)).toBe(0);
  });

  it('should return 0 for empty content', () => {
    expect(countTestCasesInContent('')).toBe(0);
  });

  it('should count tests across multiple describe blocks', () => {
    const content = `
describe('Module A', () => {
  it('test 1', () => {});
  it('test 2', () => {});
});

describe('Module B', () => {
  test('test 3', () => {});
  test('test 4', () => {});
  test('test 5', () => {});
});
    `.trim();
    expect(countTestCasesInContent(content)).toBe(5);
  });

  it('should not double-count tests on repeated calls', () => {
    const content = `it('test', () => {});`;
    expect(countTestCasesInContent(content)).toBe(1);
    expect(countTestCasesInContent(content)).toBe(1);
  });
});

// ============================================================================
// decodeBase64Content
// ============================================================================

describe('decodeBase64Content', () => {
  it('should decode base64 content', () => {
    const original = `it('test', () => {});`;
    const encoded = encodeBase64(original);
    expect(decodeBase64Content(encoded)).toBe(original);
  });

  it('should handle base64 with newlines (GitHub API format)', () => {
    const original = `it('test', () => {});\nit('test2', () => {});`;
    const encoded = encodeBase64(original);
    // Simulate GitHub API adding newlines in the base64 string
    const withNewlines = encoded.replace(/.{76}/g, '$&\n');
    expect(decodeBase64Content(withNewlines)).toBe(original);
  });

  it('should handle empty content', () => {
    const encoded = encodeBase64('');
    expect(decodeBase64Content(encoded)).toBe('');
  });

  it('should handle multiline test file content', () => {
    const original = [
      "describe('Auth', () => {",
      "  it('should login', () => {});",
      "  it('should logout', () => {});",
      '});',
    ].join('\n');
    const encoded = encodeBase64(original);
    expect(decodeBase64Content(encoded)).toBe(original);
  });
});

// ============================================================================
// getTestFilesInBranch
// ============================================================================

describe('getTestFilesInBranch', () => {
  it('should return only test files from the tree', async () => {
    const tree: MockTreeItem[] = [
      { path: 'src/auth.ts', type: 'blob', sha: 'sha1' },
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha2' },
      { path: 'src/api.spec.ts', type: 'blob', sha: 'sha3' },
      { path: 'README.md', type: 'blob', sha: 'sha4' },
      { path: 'src', type: 'tree', sha: 'sha5' }, // directory — should be excluded
    ];

    const octokit = createMockOctokit({ tree });
    const files = await getTestFilesInBranch(octokit, 'owner', 'repo', 'main');

    expect(files).toHaveLength(2);
    expect(files).toContain('__tests__/auth.test.ts');
    expect(files).toContain('src/api.spec.ts');
  });

  it('should return empty array when no test files exist', async () => {
    const tree: MockTreeItem[] = [
      { path: 'src/auth.ts', type: 'blob', sha: 'sha1' },
      { path: 'README.md', type: 'blob', sha: 'sha2' },
    ];

    const octokit = createMockOctokit({ tree });
    const files = await getTestFilesInBranch(octokit, 'owner', 'repo', 'main');
    expect(files).toHaveLength(0);
  });

  it('should filter out tree items with no path', async () => {
    const tree: MockTreeItem[] = [
      { type: 'blob', sha: 'sha1' }, // no path
      { path: 'src/api.test.ts', type: 'blob', sha: 'sha2' },
    ];

    const octokit = createMockOctokit({ tree });
    const files = await getTestFilesInBranch(octokit, 'owner', 'repo', 'main');
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('src/api.test.ts');
  });

  it('should use the correct branch ref', async () => {
    const octokit = createMockOctokit({ tree: [] });
    await getTestFilesInBranch(octokit, 'owner', 'repo', 'feature/my-branch');

    expect(octokit.rest.git.getRef).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      ref: 'heads/feature/my-branch',
    });
  });

  it('should pass tree SHA to getTree', async () => {
    const octokit = createMockOctokit({ commitTreeSha: 'my-tree-sha', tree: [] });
    await getTestFilesInBranch(octokit, 'owner', 'repo', 'main');

    expect(octokit.rest.git.getTree).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      tree_sha: 'my-tree-sha',
      recursive: '1',
    });
  });
});

// ============================================================================
// countTestsInBranch
// ============================================================================

describe('countTestsInBranch', () => {
  it('should return correct snapshot for branch with tests', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
      { path: '__tests__/api.test.ts', type: 'blob', sha: 'sha2' },
    ];

    const contentsByPath: Record<string, string> = {
      '__tests__/auth.test.ts': `
it('should login', () => {});
it('should logout', () => {});
it('should refresh token', () => {});
      `.trim(),
      '__tests__/api.test.ts': `
test('should fetch data', () => {});
test('should handle error', () => {});
      `.trim(),
    };

    const octokit = createMockOctokit({ tree, contentsByPath });
    const snapshot = await countTestsInBranch(octokit, 'owner', 'repo', 'main');

    expect(snapshot.branch).toBe('main');
    expect(snapshot.testFiles).toBe(2);
    expect(snapshot.totalTests).toBe(5);
  });

  it('should return zero counts when no test files', async () => {
    const octokit = createMockOctokit({ tree: [] });
    const snapshot = await countTestsInBranch(octokit, 'owner', 'repo', 'main');

    expect(snapshot.totalTests).toBe(0);
    expect(snapshot.testFiles).toBe(0);
    expect(snapshot.branch).toBe('main');
  });

  it('should skip files that cannot be read', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
      { path: '__tests__/api.test.ts', type: 'blob', sha: 'sha2' },
    ];

    // Only provide content for one file — the other will throw
    const contentsByPath: Record<string, string> = {
      '__tests__/auth.test.ts': `it('test 1', () => {});\nit('test 2', () => {});`,
    };

    const octokit = createMockOctokit({ tree, contentsByPath });
    const snapshot = await countTestsInBranch(octokit, 'owner', 'repo', 'main');

    // Should still count the accessible file's tests
    expect(snapshot.totalTests).toBe(2);
    expect(snapshot.testFiles).toBe(2); // both files found, one unreadable
  });

  it('should pass branch as ref when fetching file content', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];
    const contentsByPath: Record<string, string> = {
      '__tests__/auth.test.ts': `it('test', () => {});`,
    };

    const octokit = createMockOctokit({ tree, contentsByPath });
    await countTestsInBranch(octokit, 'owner', 'repo', 'feature/my-branch');

    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'feature/my-branch' })
    );
  });
});

// ============================================================================
// detectTestCountRegression
// ============================================================================

describe('detectTestCountRegression', () => {
  it('should detect regression when branch has fewer tests than base', async () => {
    const baseTree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];
    const headTree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha2' },
    ];

    // Base: 5 tests, Head: 3 tests → regression
    const baseContent = `
it('test 1', () => {});
it('test 2', () => {});
it('test 3', () => {});
it('test 4', () => {});
it('test 5', () => {});
    `.trim();

    const headContent = `
it('test 1', () => {});
it('test 2', () => {});
it('test 3', () => {});
    `.trim();

    // Create two different octokits (one for each branch)
    let callCount = 0;
    const octokit: TestCountOctokitLike = {
      rest: {
        repos: {
          getContent: jest.fn().mockImplementation(
            ({ ref }: { ref?: string; path: string; owner: string; repo: string }) => {
              const content = ref === 'main' ? baseContent : headContent;
              return Promise.resolve({
                data: { content: encodeBase64(content), encoding: 'base64' },
              });
            }
          ),
        },
        git: {
          getRef: jest.fn().mockImplementation(({ ref }: { ref: string; owner: string; repo: string }) => {
            callCount++;
            return Promise.resolve({ data: { object: { sha: `sha-${callCount}` } } });
          }),
          getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree-sha' } } }),
          getTree: jest.fn().mockImplementation(() => {
            const isFirst = (octokit.rest.git.getTree as jest.Mock).mock.calls.length === 1;
            return Promise.resolve({ data: { tree: isFirst ? headTree : baseTree } });
          }),
        },
      },
    };

    const options = createDefaultRegressionOptions(octokit);
    const result = await detectTestCountRegression(options);

    expect(result.hasRegression).toBe(true);
    expect(result.delta).toBeLessThan(0);
    expect(result.message).toContain('decreased');
  });

  it('should not flag regression when test count is unchanged', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];
    const content = `it('test 1', () => {}); it('test 2', () => {});`;

    const octokit: TestCountOctokitLike = {
      rest: {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: { content: encodeBase64(content), encoding: 'base64' },
          }),
        },
        git: {
          getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'abc' } } }),
          getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree' } } }),
          getTree: jest.fn().mockResolvedValue({ data: { tree } }),
        },
      },
    };

    const options = createDefaultRegressionOptions(octokit);
    const result = await detectTestCountRegression(options);

    expect(result.hasRegression).toBe(false);
    expect(result.delta).toBe(0);
    expect(result.branchCount).toBe(result.baseCount);
  });

  it('should not flag regression when test count increases', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];

    let callCount = 0;
    const octokit: TestCountOctokitLike = {
      rest: {
        repos: {
          getContent: jest.fn().mockImplementation(
            ({ ref }: { ref?: string; path: string; owner: string; repo: string }) => {
              // head branch gets more tests
              const content = ref === 'main'
                ? `it('t1', () => {}); it('t2', () => {});`
                : `it('t1', () => {}); it('t2', () => {}); it('t3', () => {});`;
              return Promise.resolve({
                data: { content: encodeBase64(content), encoding: 'base64' },
              });
            }
          ),
        },
        git: {
          getRef: jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve({ data: { object: { sha: `sha-${callCount}` } } });
          }),
          getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree' } } }),
          getTree: jest.fn().mockResolvedValue({ data: { tree } }),
        },
      },
    };

    const options = createDefaultRegressionOptions(octokit);
    const result = await detectTestCountRegression(options);

    expect(result.hasRegression).toBe(false);
    expect(result.delta).toBeGreaterThanOrEqual(0);
  });

  it('should return correct delta value', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];

    let callCount = 0;
    const octokit: TestCountOctokitLike = {
      rest: {
        repos: {
          getContent: jest.fn().mockImplementation(
            ({ ref }: { ref?: string; path: string; owner: string; repo: string }) => {
              const content = ref === 'main'
                ? `it('t1', () => {}); it('t2', () => {}); it('t3', () => {}); it('t4', () => {}); it('t5', () => {});` // 5 tests
                : `it('t1', () => {}); it('t2', () => {});`; // 2 tests
              return Promise.resolve({
                data: { content: encodeBase64(content), encoding: 'base64' },
              });
            }
          ),
        },
        git: {
          getRef: jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve({ data: { object: { sha: `sha-${callCount}` } } });
          }),
          getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree' } } }),
          getTree: jest.fn().mockImplementation(() => {
            const callNum = (octokit.rest.git.getTree as jest.Mock).mock.calls.length;
            return Promise.resolve({ data: { tree } });
          }),
        },
      },
    };

    const options = createDefaultRegressionOptions(octokit);
    const result = await detectTestCountRegression(options);

    // delta = branch - base
    expect(result.delta).toBe(result.branchCount - result.baseCount);
  });

  it('should include non-regression message with count when no regression', async () => {
    const tree: MockTreeItem[] = [
      { path: '__tests__/auth.test.ts', type: 'blob', sha: 'sha1' },
    ];
    const content = `it('t1', () => {}); it('t2', () => {});`;

    const octokit: TestCountOctokitLike = {
      rest: {
        repos: {
          getContent: jest.fn().mockResolvedValue({
            data: { content: encodeBase64(content), encoding: 'base64' },
          }),
        },
        git: {
          getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'abc' } } }),
          getCommit: jest.fn().mockResolvedValue({ data: { tree: { sha: 'tree' } } }),
          getTree: jest.fn().mockResolvedValue({ data: { tree } }),
        },
      },
    };

    const options = createDefaultRegressionOptions(octokit);
    const result = await detectTestCountRegression(options);

    expect(result.message).toContain('Test count');
    expect(result.message).not.toContain('decreased');
  });
});

// ============================================================================
// formatTestCountRegressionWarning
// ============================================================================

describe('formatTestCountRegressionWarning', () => {
  function makeResult(overrides: Partial<TestCountRegressionResult> = {}): TestCountRegressionResult {
    return {
      hasRegression: true,
      branchCount: 15,
      baseCount: 20,
      delta: -5,
      message: 'Test count decreased: 20 → 15. Verify no tests were accidentally removed',
      ...overrides,
    };
  }

  it('should return empty string when no regression', () => {
    const result = makeResult({ hasRegression: false, branchCount: 20, baseCount: 20, delta: 0 });
    expect(formatTestCountRegressionWarning(result)).toBe('');
  });

  it('should include warning header when regression detected', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('Test Count Regression');
  });

  it('should include before and after counts', () => {
    const result = makeResult({ baseCount: 20, branchCount: 15, delta: -5 });
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('20');
    expect(output).toContain('15');
    expect(output).toContain('-5');
  });

  it('should include the result message', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain(result.message);
  });

  it('should mention what to check', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('What to check');
  });

  it('should note this is a WARN, not blocking', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('WARN');
    expect(output).toContain('not blocking');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should mention checking for accidentally deleted test files', () => {
    const result = makeResult();
    const output = formatTestCountRegressionWarning(result);
    expect(output).toContain('deleted');
  });
});
