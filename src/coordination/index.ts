/**
 * Coordination Module
 *
 * Cross-agent coordination features for Hawky.
 * Detects potential conflicts between concurrent PRs and branches.
 */

/**
 * Coordination Module
 *
 * Cross-agent coordination features for Hawky.
 * Detects potential conflicts between concurrent PRs and branches.
 */

export {
  // Types
  type OverlappingFile,
  type ConflictingPR,
  type ConcurrentPRResult,
  type ConcurrentPROptions,
  type OctokitLike,
  // Functions
  findOverlappingFiles,
  detectConcurrentPRs,
  formatConcurrentPRWarning,
} from './concurrent-prs';

export {
  // Types
  type StaleCheckResult,
  type StaleCheckOptions,
  type StaleWarning,
  type StaleOctokitLike,
  // Functions
  checkStaleBranch,
  formatStaleBranchWarning,
} from './stale-branch';

export {
  // Types
  type TestCountSnapshot,
  type TestCountRegressionResult,
  type TestCountRegressionOptions,
  type TestCountOctokitLike,
  // Constants
  TEST_FILE_PATTERNS,
  TEST_CASE_PATTERNS,
  // Functions
  isTestFile,
  countTestCasesInContent,
  decodeBase64Content,
  getTestFilesInBranch,
  countTestsInBranch,
  detectTestCountRegression,
  formatTestCountRegressionWarning,
} from './test-count-regression';

export {
  // Types
  type CommitAuthor,
  type AuthorshipResult,
  type AuthorshipOptions,
  type AuthorshipOctokitLike,
  // Functions
  tallyAuthors,
  getPrimaryAuthor,
  detectMixedAuthorship,
  formatAuthorshipAttribution,
} from './authorship-attribution';

export {
  // Types
  type MigrationPR,
  type SchemaMigrationResult,
  type SchemaMigrationOptions,
  type SchemaMigrationOctokitLike,
  // Constants
  DEFAULT_MIGRATION_PATTERNS,
  // Functions
  isMigrationFile,
  filterMigrationFiles,
  detectParallelMigrations,
  formatSchemaMigrationBlock,
} from './schema-migration';

export {
  // Types
  type StaleSpec,
  type SpecMismatchResult,
  type SpecMismatchOptions,
  type SpecMismatchOctokitLike,
  // Constants
  DEFAULT_SPEC_PATTERNS,
  // Functions
  isSpecFile,
  findBranchCutPoint,
  checkSpecStaleness,
  detectSpecMismatch,
  formatSpecMismatchWarning,
} from './spec-version-mismatch';
