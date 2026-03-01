/**
 * Tests for Parallel Schema Migration Detection (S037)
 */

import {
  isMigrationFile,
  filterMigrationFiles,
  detectParallelMigrations,
  formatSchemaMigrationBlock,
  DEFAULT_MIGRATION_PATTERNS,
  type SchemaMigrationResult,
  type SchemaMigrationOptions,
  type SchemaMigrationOctokitLike,
} from '../../src/coordination/schema-migration';

// ============================================================================
// Mock Helpers
// ============================================================================

type MockPR = {
  number: number;
  title: string;
  user: { login: string } | null;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
};

type MockFile = { filename: string };

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

function createMockOctokit(
  prs: MockPR[],
  filesPerPR: Record<number, MockFile[]>
): SchemaMigrationOctokitLike {
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

function createDefaultOptions(
  octokit: SchemaMigrationOctokitLike,
  currentPRFiles: string[],
  overrides: Partial<SchemaMigrationOptions> = {}
): SchemaMigrationOptions {
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
// isMigrationFile
// ============================================================================

describe('isMigrationFile', () => {
  it('should detect files in migrations/ directory', () => {
    expect(isMigrationFile('src/migrations/001_create_users.sql')).toBe(true);
  });

  it('should detect files in db/migrate/ directory', () => {
    expect(isMigrationFile('db/migrate/20240101_add_column.rb')).toBe(true);
  });

  it('should detect Prisma migrations', () => {
    expect(isMigrationFile('prisma/migrations/20240101_init/migration.sql')).toBe(true);
  });

  it('should detect Alembic version files', () => {
    expect(isMigrationFile('alembic/versions/abc123_add_table.py')).toBe(true);
  });

  it('should detect Flyway migration files', () => {
    expect(isMigrationFile('V1__Create_table.sql')).toBe(true);
  });

  it('should detect Liquibase files', () => {
    expect(isMigrationFile('liquibase/changelog.xml')).toBe(true);
  });

  it('should detect timestamp-prefixed TS migration files', () => {
    expect(isMigrationFile('1700000000000_add_index.ts')).toBe(true);
  });

  it('should detect timestamp-prefixed SQL migration files', () => {
    expect(isMigrationFile('20240101120000_create_schema.sql')).toBe(true);
  });

  it('should detect Django migration files', () => {
    expect(isMigrationFile('myapp/migrations/0001_initial.py')).toBe(true);
  });

  it('should detect database/migrations/ directory', () => {
    expect(isMigrationFile('database/migrations/create_users.sql')).toBe(true);
  });

  it('should not detect regular source files', () => {
    expect(isMigrationFile('src/auth.ts')).toBe(false);
  });

  it('should not detect test files', () => {
    expect(isMigrationFile('__tests__/auth.test.ts')).toBe(false);
  });

  it('should not detect README files', () => {
    expect(isMigrationFile('README.md')).toBe(false);
  });

  it('should not detect config files', () => {
    expect(isMigrationFile('jest.config.js')).toBe(false);
  });

  it('should not detect files with "migration" in name but not in a migration path', () => {
    expect(isMigrationFile('src/utils/migration-helper.ts')).toBe(false);
  });

  it('should support custom patterns', () => {
    const customPattern = [/custom-migrations\//];
    expect(isMigrationFile('custom-migrations/001_setup.sql', customPattern)).toBe(true);
    expect(isMigrationFile('src/auth.ts', customPattern)).toBe(false);
  });
});

// ============================================================================
// filterMigrationFiles
// ============================================================================

describe('filterMigrationFiles', () => {
  it('should filter only migration files from a list', () => {
    const files = [
      'src/auth.ts',
      'db/migrate/20240101_add_users.sql',
      'README.md',
      'prisma/migrations/20240102_add_posts/migration.sql',
      'package.json',
    ];

    const result = filterMigrationFiles(files);
    expect(result).toHaveLength(2);
    expect(result).toContain('db/migrate/20240101_add_users.sql');
    expect(result).toContain('prisma/migrations/20240102_add_posts/migration.sql');
  });

  it('should return empty array when no migration files', () => {
    const files = ['src/auth.ts', 'src/api.ts', 'README.md'];
    expect(filterMigrationFiles(files)).toHaveLength(0);
  });

  it('should return empty array for empty input', () => {
    expect(filterMigrationFiles([])).toHaveLength(0);
  });

  it('should return all files if all are migrations', () => {
    const files = [
      'migrations/001_create_users.sql',
      'migrations/002_add_email.sql',
    ];
    const result = filterMigrationFiles(files);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// detectParallelMigrations
// ============================================================================

describe('detectParallelMigrations', () => {
  it('should return no parallel migrations when current PR has no migrations', async () => {
    const octokit = createMockOctokit([], {});
    const files = ['src/auth.ts', 'src/api.ts'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(false);
    expect(result.currentPRMigrations).toHaveLength(0);
    expect(result.prsScanned).toBe(0);
    expect(octokit.rest.pulls.list).not.toHaveBeenCalled();
  });

  it('should return no parallel migrations when no other PRs have migrations', async () => {
    const otherPR = createMockPR(101, 'Add feature');
    const octokit = createMockOctokit(
      [otherPR],
      { 101: [{ filename: 'src/feature.ts' }] }
    );

    const files = ['db/migrate/20240101_add_users.sql', 'src/auth.ts'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(false);
    expect(result.currentPRMigrations).toHaveLength(1);
    expect(result.migrationPRs).toHaveLength(0);
  });

  it('should detect parallel migrations when another open PR has migrations', async () => {
    const otherPR = createMockPR(101, 'Add user table');
    const octokit = createMockOctokit(
      [otherPR],
      { 101: [{ filename: 'db/migrate/20240102_add_users.sql' }, { filename: 'src/user.ts' }] }
    );

    const files = ['db/migrate/20240101_add_posts.sql', 'src/post.ts'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(true);
    expect(result.migrationPRs).toHaveLength(1);
    expect(result.migrationPRs[0].number).toBe(101);
    expect(result.migrationPRs[0].migrationFiles).toContain('db/migrate/20240102_add_users.sql');
    expect(result.currentPRMigrations).toContain('db/migrate/20240101_add_posts.sql');
  });

  it('should detect multiple other PRs with migrations', async () => {
    const pr1 = createMockPR(101, 'Migration A');
    const pr2 = createMockPR(102, 'Migration B');
    const pr3 = createMockPR(103, 'No Migration');
    const octokit = createMockOctokit(
      [pr1, pr2, pr3],
      {
        101: [{ filename: 'migrations/001_schema.sql' }],
        102: [{ filename: 'migrations/002_index.sql' }],
        103: [{ filename: 'src/api.ts' }],
      }
    );

    const files = ['migrations/003_update.sql'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(true);
    expect(result.migrationPRs).toHaveLength(2);
    expect(result.prsScanned).toBe(3);
  });

  it('should exclude the current PR from the list of other migration PRs', async () => {
    const currentPR = createMockPR(100, 'Current PR');
    const octokit = createMockOctokit(
      [currentPR], // only the current PR itself is returned
      { 100: [{ filename: 'migrations/001_current.sql' }] }
    );

    const files = ['migrations/001_current.sql'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(false);
    expect(result.migrationPRs).toHaveLength(0);
  });

  it('should include migration file details for other PRs', async () => {
    const otherPR = createMockPR(101, 'Schema change', 'be-schema-update');
    const octokit = createMockOctokit(
      [otherPR],
      { 101: [
        { filename: 'migrations/001_create_table.sql' },
        { filename: 'migrations/002_add_index.sql' },
      ]}
    );

    const files = ['migrations/003_add_column.sql'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.migrationPRs[0].migrationFiles).toHaveLength(2);
    expect(result.migrationPRs[0].headBranch).toBe('be-schema-update');
    expect(result.migrationPRs[0].author).toBe('user-101');
  });

  it('should skip PRs that cannot be fetched', async () => {
    const pr1 = createMockPR(101, 'Accessible PR');
    const pr2 = createMockPR(102, 'Inaccessible PR');
    const octokit: SchemaMigrationOctokitLike = {
      rest: {
        pulls: {
          list: jest.fn().mockResolvedValue({ data: [pr1, pr2] }),
          listFiles: jest.fn().mockImplementation(({ pull_number }: { pull_number: number }) => {
            if (pull_number === 102) throw new Error('Forbidden');
            return Promise.resolve({ data: [{ filename: 'migrations/001.sql' }] });
          }),
        },
      },
    };

    const files = ['migrations/002.sql'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    // Should find pr1 but skip pr2
    expect(result.migrationPRs).toHaveLength(1);
    expect(result.migrationPRs[0].number).toBe(101);
  });

  it('should include message explaining the conflict', async () => {
    const otherPR = createMockPR(101, 'Other migration');
    const octokit = createMockOctokit(
      [otherPR],
      { 101: [{ filename: 'migrations/other.sql' }] }
    );

    const files = ['migrations/current.sql'];
    const options = createDefaultOptions(octokit, files);
    const result = await detectParallelMigrations(options);

    expect(result.message).toContain('serially');
    expect(result.message).toContain('#101');
  });

  it('should filter by baseBranch when provided', async () => {
    const octokit = createMockOctokit([], {});
    const files = ['migrations/001.sql'];
    const options = createDefaultOptions(octokit, files, { baseBranch: 'dev' });
    await detectParallelMigrations(options);

    expect(octokit.rest.pulls.list).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'dev' })
    );
  });

  it('should support custom migration patterns', async () => {
    const otherPR = createMockPR(101, 'Custom migration');
    const octokit = createMockOctokit(
      [otherPR],
      { 101: [{ filename: 'custom-db/migration-001.sql' }] }
    );

    const files = ['custom-db/migration-002.sql'];
    const customPatterns = [/custom-db\/migration-/];
    const options = createDefaultOptions(octokit, files, { migrationPatterns: customPatterns });
    const result = await detectParallelMigrations(options);

    expect(result.hasParallelMigrations).toBe(true);
    expect(result.currentPRMigrations).toContain('custom-db/migration-002.sql');
  });
});

// ============================================================================
// formatSchemaMigrationBlock
// ============================================================================

describe('formatSchemaMigrationBlock', () => {
  function makeResult(overrides: Partial<SchemaMigrationResult> = {}): SchemaMigrationResult {
    return {
      hasParallelMigrations: true,
      migrationPRs: [
        {
          number: 101,
          title: 'Add user table',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/101',
          migrationFiles: ['db/migrate/20240101_add_users.sql'],
          headBranch: 'be-add-users',
        },
      ],
      currentPRMigrations: ['db/migrate/20240102_add_posts.sql'],
      prsScanned: 5,
      message: 'Parallel migrations detected',
      ...overrides,
    };
  }

  it('should return empty string when no parallel migrations', () => {
    const result = makeResult({ hasParallelMigrations: false, migrationPRs: [] });
    expect(formatSchemaMigrationBlock(result)).toBe('');
  });

  it('should include BLOCK header', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('Parallel Schema Migrations');
  });

  it('should include current PR migration files', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('db/migrate/20240102_add_posts.sql');
  });

  it('should include other PR details', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('#101');
    expect(output).toContain('Add user table');
    expect(output).toContain('@alice');
  });

  it('should include advice to merge serially', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    // Should mention merging one at a time or serially
    const lower = output.toLowerCase();
    expect(lower.includes('serial') || lower.includes('one at a time') || lower.includes('merge')).toBe(true);
  });

  it('should note this is a BLOCK', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('BLOCK');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include head branch of other PRs', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('be-add-users');
  });

  it('should truncate migration files list when PR has many migrations', () => {
    const result = makeResult({
      migrationPRs: [{
        number: 101,
        title: 'Big migration',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/101',
        migrationFiles: [
          'migrations/001.sql',
          'migrations/002.sql',
          'migrations/003.sql',
          'migrations/004.sql',
          'migrations/005.sql',
        ],
        headBranch: 'be-big-migration',
      }],
    });
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('more');
  });

  it('should include PR link as markdown', () => {
    const result = makeResult();
    const output = formatSchemaMigrationBlock(result);
    expect(output).toContain('https://github.com/owner/repo/pull/101');
  });
});
