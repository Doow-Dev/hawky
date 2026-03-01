/**
 * Tests for API Contract Divergence Detection (S036)
 */

import {
  isApiContractFile,
  filterApiContractFiles,
  isFrontendBranch,
  detectSuppression,
  detectContractDivergence,
  formatContractDivergenceBlock,
  API_CONTRACT_PATTERNS,
  FRONTEND_BRANCH_PATTERNS,
  type ContractDivergenceOctokitLike,
  type ContractDivergenceOptions,
  type ContractDivergenceResult,
} from '../../src/coordination/api-contract-divergence';

// ============================================================================
// Mock helpers
// ============================================================================

type MockOpenPR = {
  number: number;
  title: string;
  head: { ref: string };
  base: { ref: string };
  user: { login: string } | null;
  html_url: string;
};

function createMockOctokit(openPRs: MockOpenPR[]): ContractDivergenceOctokitLike {
  return {
    rest: {
      pulls: {
        list: jest.fn().mockResolvedValue({ data: openPRs }),
      },
    },
  };
}

function createMockPR(
  number: number,
  headRef: string,
  author = 'dev'
): MockOpenPR {
  return {
    number,
    title: `PR ${number}`,
    head: { ref: headRef },
    base: { ref: 'dev' },
    user: { login: author },
    html_url: `https://github.com/owner/repo/pull/${number}`,
  };
}

function createDefaultOptions(
  changedFiles: string[],
  openPRs: MockOpenPR[],
  overrides: Partial<ContractDivergenceOptions> = {}
): ContractDivergenceOptions {
  return {
    octokit: createMockOctokit(openPRs),
    owner: 'owner',
    repo: 'repo',
    headBranch: 'be-S036-api-update',
    baseBranch: 'dev',
    changedFiles,
    ...overrides,
  };
}

// ============================================================================
// isApiContractFile
// ============================================================================

describe('isApiContractFile', () => {
  it('should return true for src/routes/ files', () => {
    expect(isApiContractFile('src/routes/users.ts')).toBe(true);
  });

  it('should return true for src/controllers/ files', () => {
    expect(isApiContractFile('src/controllers/auth.ts')).toBe(true);
  });

  it('should return true for src/endpoints/ files', () => {
    expect(isApiContractFile('src/endpoints/health.ts')).toBe(true);
  });

  it('should return true for src/handlers/ files', () => {
    expect(isApiContractFile('src/handlers/webhook.ts')).toBe(true);
  });

  it('should return true for openapi.yaml', () => {
    expect(isApiContractFile('openapi.yaml')).toBe(true);
  });

  it('should return true for openapi.json', () => {
    expect(isApiContractFile('openapi.json')).toBe(true);
  });

  it('should return true for swagger.yml', () => {
    expect(isApiContractFile('swagger.yml')).toBe(true);
  });

  it('should return true for schema.graphql', () => {
    expect(isApiContractFile('schema.graphql')).toBe(true);
  });

  it('should return true for schema.gql', () => {
    expect(isApiContractFile('schema.gql')).toBe(true);
  });

  it('should return true for .proto files', () => {
    expect(isApiContractFile('proto/service.proto')).toBe(true);
  });

  it('should return true for tRPC router files', () => {
    expect(isApiContractFile('src/trpc/userRouter.ts')).toBe(true);
  });

  it('should return false for regular source files', () => {
    expect(isApiContractFile('src/utils/helpers.ts')).toBe(false);
  });

  it('should return false for test files', () => {
    expect(isApiContractFile('__tests__/api/routes.test.ts')).toBe(false);
  });

  it('should return false for README', () => {
    expect(isApiContractFile('README.md')).toBe(false);
  });

  it('should return false for package.json', () => {
    expect(isApiContractFile('package.json')).toBe(false);
  });
});

// ============================================================================
// filterApiContractFiles
// ============================================================================

describe('filterApiContractFiles', () => {
  it('should return only API contract files', () => {
    const files = [
      'src/routes/users.ts',
      'src/utils/helpers.ts',
      'openapi.yaml',
      'README.md',
    ];
    const result = filterApiContractFiles(files);
    expect(result).toContain('src/routes/users.ts');
    expect(result).toContain('openapi.yaml');
    expect(result).not.toContain('src/utils/helpers.ts');
    expect(result).not.toContain('README.md');
  });

  it('should return empty array when no contract files', () => {
    expect(filterApiContractFiles(['README.md', 'package.json'])).toHaveLength(0);
  });

  it('should return empty array for empty input', () => {
    expect(filterApiContractFiles([])).toHaveLength(0);
  });
});

// ============================================================================
// isFrontendBranch
// ============================================================================

describe('isFrontendBranch', () => {
  it('should return true for fe- prefix', () => {
    expect(isFrontendBranch('fe-S047-login-ui')).toBe(true);
  });

  it('should return true for ui- prefix', () => {
    expect(isFrontendBranch('ui-S047-dashboard')).toBe(true);
  });

  it('should return true for frontend- prefix', () => {
    expect(isFrontendBranch('frontend-S047-form')).toBe(true);
  });

  it('should return true for front- prefix', () => {
    expect(isFrontendBranch('front-S047-navbar')).toBe(true);
  });

  it('should return true for client- prefix', () => {
    expect(isFrontendBranch('client-S047-mobile')).toBe(true);
  });

  it('should return true for web- prefix', () => {
    expect(isFrontendBranch('web-S047-landing')).toBe(true);
  });

  it('should return false for be- prefix', () => {
    expect(isFrontendBranch('be-S036-api-update')).toBe(false);
  });

  it('should return false for S### branch', () => {
    expect(isFrontendBranch('S047-sprint-status')).toBe(false);
  });

  it('should return false for main/dev branches', () => {
    expect(isFrontendBranch('main')).toBe(false);
    expect(isFrontendBranch('dev')).toBe(false);
  });

  it('should return false for luna/sprint8 style', () => {
    expect(isFrontendBranch('luna/sprint8')).toBe(false);
  });
});

// ============================================================================
// detectSuppression
// ============================================================================

describe('detectSuppression', () => {
  it('should detect suppression in PR body', () => {
    const body = 'This PR updates the API.\n# hawk-ignore: contract-divergence — reason: coordinated with Nova';
    const result = detectSuppression(body, undefined);
    expect(result.suppressed).toBe(true);
    expect(result.reason).toContain('coordinated with Nova');
  });

  it('should detect suppression with em-dash variant', () => {
    const body = '# hawk-ignore: contract-divergence — reason: frontend already updated';
    const result = detectSuppression(body, undefined);
    expect(result.suppressed).toBe(true);
    expect(result.reason).toBe('frontend already updated');
  });

  it('should detect suppression with hyphen variant', () => {
    const body = '# hawk-ignore: contract-divergence - reason: planned migration';
    const result = detectSuppression(body, undefined);
    expect(result.suppressed).toBe(true);
  });

  it('should detect suppression in file contents', () => {
    const fileContents = {
      'src/routes/users.ts': '// hawk-ignore: contract-divergence — reason: nova is synced',
    };
    const result = detectSuppression(undefined, fileContents);
    expect(result.suppressed).toBe(true);
    expect(result.reason).toBe('nova is synced');
  });

  it('should return false when no suppression found', () => {
    const result = detectSuppression('No suppression here', {});
    expect(result.suppressed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('should return false when PR body and fileContents are undefined', () => {
    const result = detectSuppression(undefined, undefined);
    expect(result.suppressed).toBe(false);
  });

  it('should require a reason after the dash', () => {
    // Missing reason — should not suppress (too vague to honor)
    const body = '# hawk-ignore: contract-divergence';
    const result = detectSuppression(body, undefined);
    expect(result.suppressed).toBe(false);
  });
});

// ============================================================================
// detectContractDivergence
// ============================================================================

describe('detectContractDivergence', () => {
  it('should skip when no API contract files changed', async () => {
    const options = createDefaultOptions(
      ['README.md', 'src/utils/helpers.ts'],
      [createMockPR(10, 'fe-S047-ui')]
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(false);
    expect(result.contractFiles).toHaveLength(0);
    expect(result.message).toContain('skipped');
  });

  it('should detect divergence when frontend PR is open', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts', 'openapi.yaml'],
      [createMockPR(10, 'fe-S047-user-list')]
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(true);
    expect(result.contractFiles).toContain('src/routes/users.ts');
    expect(result.frontendPRs).toHaveLength(1);
    expect(result.frontendPRs[0].number).toBe(10);
  });

  it('should return no divergence when no frontend PRs are open', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [createMockPR(10, 'be-S050-backend-refactor')] // backend PR, not frontend
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(false);
    expect(result.frontendPRs).toHaveLength(0);
  });

  it('should return no divergence when no open PRs at all', async () => {
    const options = createDefaultOptions(['src/routes/users.ts'], []);
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(false);
  });

  it('should detect multiple concurrent frontend PRs', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [
        createMockPR(10, 'fe-S047-users-page'),
        createMockPR(11, 'ui-S048-dashboard'),
        createMockPR(12, 'be-S049-auth'), // not frontend
      ]
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(true);
    expect(result.frontendPRs).toHaveLength(2);
    expect(result.frontendPRs.some((p) => p.number === 10)).toBe(true);
    expect(result.frontendPRs.some((p) => p.number === 11)).toBe(true);
  });

  it('should respect suppression in PR body', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [createMockPR(10, 'fe-S047-users')],
      { prBody: '# hawk-ignore: contract-divergence — reason: already coordinated' }
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(false);
    expect(result.suppressed).toBe(true);
    expect(result.suppressionReason).toContain('already coordinated');
  });

  it('should respect suppression in file contents', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [createMockPR(10, 'fe-S047-users')],
      {
        fileContents: {
          'src/routes/users.ts': '# hawk-ignore: contract-divergence — reason: nova synced',
        },
      }
    );
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(false);
    expect(result.suppressed).toBe(true);
  });

  it('should include contract files in result', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts', 'openapi.yaml', 'src/utils/helpers.ts'],
      []
    );
    const result = await detectContractDivergence(options);

    expect(result.contractFiles).toContain('src/routes/users.ts');
    expect(result.contractFiles).toContain('openapi.yaml');
    expect(result.contractFiles).not.toContain('src/utils/helpers.ts');
  });

  it('should handle API errors gracefully and flag divergence conservatively', async () => {
    const octokit: ContractDivergenceOctokitLike = {
      rest: {
        pulls: {
          list: jest.fn().mockRejectedValue(new Error('GitHub API unavailable')),
        },
      },
    };
    const options: ContractDivergenceOptions = {
      octokit,
      owner: 'owner',
      repo: 'repo',
      headBranch: 'be-S036-api',
      baseBranch: 'dev',
      changedFiles: ['src/routes/users.ts'],
    };
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(true);
    expect(result.message).toContain('API error');
  });

  it('should include PR author in frontend PR data', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [createMockPR(10, 'fe-S047-ui', 'nova')]
    );
    const result = await detectContractDivergence(options);

    expect(result.frontendPRs[0].author).toBe('nova');
  });

  it('should include PR URL in frontend PR data', async () => {
    const options = createDefaultOptions(
      ['src/routes/users.ts'],
      [createMockPR(10, 'fe-S047-ui')]
    );
    const result = await detectContractDivergence(options);

    expect(result.frontendPRs[0].url).toContain('/pull/10');
  });

  it('should handle null user in PR data gracefully', async () => {
    const pr: MockOpenPR = {
      number: 10,
      title: 'PR 10',
      head: { ref: 'fe-S047-ui' },
      base: { ref: 'dev' },
      user: null,
      html_url: 'https://github.com/owner/repo/pull/10',
    };
    const options = createDefaultOptions(['src/routes/users.ts'], [pr]);
    const result = await detectContractDivergence(options);

    expect(result.hasDivergence).toBe(true);
    expect(result.frontendPRs[0].author).toBe('unknown');
  });
});

// ============================================================================
// formatContractDivergenceBlock
// ============================================================================

describe('formatContractDivergenceBlock', () => {
  function makeResult(
    overrides: Partial<ContractDivergenceResult> = {}
  ): ContractDivergenceResult {
    return {
      hasDivergence: true,
      contractFiles: ['src/routes/users.ts', 'openapi.yaml'],
      frontendPRs: [
        {
          number: 10,
          title: 'Add user list page',
          headBranch: 'fe-S047-user-list',
          author: 'nova',
          url: 'https://github.com/owner/repo/pull/10',
        },
      ],
      suppressed: false,
      suppressionReason: null,
      message: 'API contract files changed while frontend PR #10 is open',
      ...overrides,
    };
  }

  it('should return empty string when no divergence', () => {
    const result = makeResult({ hasDivergence: false });
    expect(formatContractDivergenceBlock(result)).toBe('');
  });

  it('should include BLOCK header with Unmet Dependencies text', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('API Contract Divergence');
    expect(output).toContain('BLOCK');
  });

  it('should list contract files', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('src/routes/users.ts');
    expect(output).toContain('openapi.yaml');
  });

  it('should list frontend PRs with links', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('#10');
    expect(output).toContain('nova');
    expect(output).toContain('fe-S047-user-list');
  });

  it('should include Next steps', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('Next steps');
    expect(output).toContain('hawk-ignore');
  });

  it('should wrap in details/summary tags', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include frontend PR count in header', () => {
    const result = makeResult({
      frontendPRs: [
        {
          number: 10,
          title: 'PR 10',
          headBranch: 'fe-S047',
          author: 'nova',
          url: 'https://github.com/owner/repo/pull/10',
        },
        {
          number: 11,
          title: 'PR 11',
          headBranch: 'ui-S048',
          author: 'nova',
          url: 'https://github.com/owner/repo/pull/11',
        },
      ],
    });
    const output = formatContractDivergenceBlock(result);
    expect(output).toContain('2');
  });

  it('should mention PR URL in output', () => {
    const output = formatContractDivergenceBlock(makeResult());
    expect(output).toContain('https://github.com/owner/repo/pull/10');
  });
});
