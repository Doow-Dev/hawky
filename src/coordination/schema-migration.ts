/**
 * Parallel Schema Migration Detection (S037)
 *
 * Detects multiple open PRs that each contain database migration files.
 * When 2+ PRs have migrations open simultaneously, blocks with a warning
 * to merge them serially and avoid migration conflicts.
 *
 * Output: BLOCK tier finding.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A PR that contains migration files
 */
export interface MigrationPR {
  /** PR number */
  number: number;

  /** PR title */
  title: string;

  /** PR author login */
  author: string;

  /** PR URL */
  url: string;

  /** Migration files found in this PR */
  migrationFiles: string[];

  /** Head branch */
  headBranch: string;
}

/**
 * Result of parallel schema migration detection
 */
export interface SchemaMigrationResult {
  /** Whether parallel migrations were detected */
  hasParallelMigrations: boolean;

  /** All PRs with migrations (including the current PR) */
  migrationPRs: MigrationPR[];

  /** Migration files in the current PR */
  currentPRMigrations: string[];

  /** Number of PRs scanned */
  prsScanned: number;

  /** Human-readable message */
  message: string;
}

/**
 * Options for schema migration detection
 */
export interface SchemaMigrationOptions {
  /** GitHub Octokit client */
  octokit: SchemaMigrationOctokitLike;

  /** Repository owner */
  owner: string;

  /** Repository name */
  repo: string;

  /** Current PR number */
  currentPRNumber: number;

  /** Files changed in the current PR */
  currentPRFiles: string[];

  /** Base branch to filter PRs by */
  baseBranch?: string;

  /** Custom migration file patterns (overrides defaults) */
  migrationPatterns?: RegExp[];
}

/**
 * Minimal Octokit interface for schema migration checks
 */
export interface SchemaMigrationOctokitLike {
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
// Constants
// ============================================================================

/**
 * Default patterns that identify database migration files.
 * Matches common ORM and raw SQL migration file conventions.
 */
export const DEFAULT_MIGRATION_PATTERNS: RegExp[] = [
  // Directory-based: migrations/, db/migrate/, database/migrations/
  /(?:^|\/)(migrations?|db\/migrate|database\/migrations?)\//i,
  // Timestamp-prefixed SQL or TypeScript migration files
  /\d{4,}_[^/]+\.(sql|ts|js)$/,
  // Alembic (Python)
  /alembic\/versions\//i,
  // Flyway
  /^V\d+__[^/]+\.sql$/i,
  // Liquibase
  /liquibase\/[^/]+\.(sql|xml|yaml|yml)$/i,
  // Prisma
  /prisma\/migrations\//i,
  // Sequelize
  /sequelize\/migrations\//i,
  // Knex
  /knex\/migrations\//i,
  // TypeORM
  /typeorm\/migrations\//i,
  // Django
  /migrations\/\d{4}_[^/]+\.py$/i,
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a file path looks like a migration file
 */
export function isMigrationFile(
  filePath: string,
  patterns: RegExp[] = DEFAULT_MIGRATION_PATTERNS
): boolean {
  return patterns.some((pattern) => pattern.test(filePath));
}

/**
 * Filter a list of file paths to only migration files
 */
export function filterMigrationFiles(
  files: string[],
  patterns: RegExp[] = DEFAULT_MIGRATION_PATTERNS
): string[] {
  return files.filter((f) => isMigrationFile(f, patterns));
}

/**
 * Detect parallel schema migrations across open PRs.
 *
 * Algorithm:
 * 1. Check if current PR has migration files
 * 2. If yes, list all open PRs and find others that also have migrations
 * 3. If 2+ PRs (including current) have migrations → BLOCK with serial merge advice
 */
export async function detectParallelMigrations(
  options: SchemaMigrationOptions
): Promise<SchemaMigrationResult> {
  const {
    octokit,
    owner,
    repo,
    currentPRNumber,
    currentPRFiles,
    baseBranch,
    migrationPatterns = DEFAULT_MIGRATION_PATTERNS,
  } = options;

  // Check what migrations the current PR has
  const currentPRMigrations = filterMigrationFiles(currentPRFiles, migrationPatterns);

  // If the current PR has no migrations, skip the full check
  if (currentPRMigrations.length === 0) {
    return {
      hasParallelMigrations: false,
      migrationPRs: [],
      currentPRMigrations: [],
      prsScanned: 0,
      message: 'No migration files detected in this PR',
    };
  }

  // Fetch open PRs
  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    ...(baseBranch ? { base: baseBranch } : {}),
    per_page: 100,
  });

  // Find other PRs with migration files
  const otherMigrationPRs: MigrationPR[] = [];
  const otherPRs = openPRs.filter((pr) => pr.number !== currentPRNumber);

  for (const pr of otherPRs) {
    try {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });

      const prMigrationFiles = filterMigrationFiles(
        files.map((f) => f.filename),
        migrationPatterns
      );

      if (prMigrationFiles.length > 0) {
        otherMigrationPRs.push({
          number: pr.number,
          title: pr.title,
          author: pr.user?.login ?? 'unknown',
          url: pr.html_url,
          migrationFiles: prMigrationFiles,
          headBranch: pr.head.ref,
        });
      }
    } catch {
      // Skip PRs we can't access
    }
  }

  const hasParallelMigrations = otherMigrationPRs.length > 0;

  let message: string;
  if (hasParallelMigrations) {
    const others = otherMigrationPRs.map((p) => `#${p.number}`).join(', ');
    message =
      `This PR contains ${currentPRMigrations.length} migration file(s), ` +
      `but ${otherMigrationPRs.length} other open PR(s) also have migrations (${others}). ` +
      `Migrations must be merged serially to avoid schema conflicts.`;
  } else {
    message = `This PR contains ${currentPRMigrations.length} migration file(s). No other open PRs have migrations.`;
  }

  return {
    hasParallelMigrations,
    migrationPRs: otherMigrationPRs,
    currentPRMigrations,
    prsScanned: otherPRs.length,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format parallel schema migration result as a PR comment section.
 * Only produces output when parallel migrations are detected.
 */
export function formatSchemaMigrationBlock(result: SchemaMigrationResult): string {
  if (!result.hasParallelMigrations) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:no_entry: **Parallel Schema Migrations** — ${result.migrationPRs.length + 1} PR(s) with migrations open simultaneously</summary>`
  );
  lines.push('');
  lines.push(
    'Multiple open PRs contain database migration files. ' +
    '**Merging them in parallel may cause schema conflicts.** ' +
    'Merge migrations one at a time.'
  );
  lines.push('');
  lines.push('**This PR\'s migration files:**');
  for (const file of result.currentPRMigrations) {
    lines.push(`- \`${file}\``);
  }
  lines.push('');
  lines.push('**Other open PRs with migrations:**');
  for (const pr of result.migrationPRs) {
    lines.push(`**[#${pr.number}: ${pr.title}](${pr.url})** by @${pr.author}`);
    lines.push(`Branch: \`${pr.headBranch}\``);
    if (pr.migrationFiles.length <= 3) {
      for (const file of pr.migrationFiles) {
        lines.push(`- \`${file}\``);
      }
    } else {
      lines.push(`- ${pr.migrationFiles.slice(0, 2).map((f) => `\`${f}\``).join(', ')} and ${pr.migrationFiles.length - 2} more`);
    }
    lines.push('');
  }
  lines.push('**Resolution:** Coordinate with other PR authors. Merge one migration PR first, then rebase and merge the next.');
  lines.push('');
  lines.push('*This is a BLOCK — review required before merging.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectParallelMigrations as default };
