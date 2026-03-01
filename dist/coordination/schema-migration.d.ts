/**
 * Parallel Schema Migration Detection (S037)
 *
 * Detects multiple open PRs that each contain database migration files.
 * When 2+ PRs have migrations open simultaneously, blocks with a warning
 * to merge them serially and avoid migration conflicts.
 *
 * Output: BLOCK tier finding.
 */
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
                    user: {
                        login: string;
                    } | null;
                    html_url: string;
                    head: {
                        ref: string;
                    };
                    base: {
                        ref: string;
                    };
                }>;
            }>;
            listFiles(params: {
                owner: string;
                repo: string;
                pull_number: number;
                per_page: number;
            }): Promise<{
                data: Array<{
                    filename: string;
                }>;
            }>;
        };
    };
}
/**
 * Default patterns that identify database migration files.
 * Matches common ORM and raw SQL migration file conventions.
 */
export declare const DEFAULT_MIGRATION_PATTERNS: RegExp[];
/**
 * Check if a file path looks like a migration file
 */
export declare function isMigrationFile(filePath: string, patterns?: RegExp[]): boolean;
/**
 * Filter a list of file paths to only migration files
 */
export declare function filterMigrationFiles(files: string[], patterns?: RegExp[]): string[];
/**
 * Detect parallel schema migrations across open PRs.
 *
 * Algorithm:
 * 1. Check if current PR has migration files
 * 2. If yes, list all open PRs and find others that also have migrations
 * 3. If 2+ PRs (including current) have migrations → BLOCK with serial merge advice
 */
export declare function detectParallelMigrations(options: SchemaMigrationOptions): Promise<SchemaMigrationResult>;
/**
 * Format parallel schema migration result as a PR comment section.
 * Only produces output when parallel migrations are detected.
 */
export declare function formatSchemaMigrationBlock(result: SchemaMigrationResult): string;
export { detectParallelMigrations as default };
//# sourceMappingURL=schema-migration.d.ts.map