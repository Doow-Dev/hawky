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
export { type OverlappingFile, type ConflictingPR, type ConcurrentPRResult, type ConcurrentPROptions, type OctokitLike, findOverlappingFiles, detectConcurrentPRs, formatConcurrentPRWarning, } from './concurrent-prs';
export { type StaleCheckResult, type StaleCheckOptions, type StaleWarning, type StaleOctokitLike, checkStaleBranch, formatStaleBranchWarning, } from './stale-branch';
export { type TestCountSnapshot, type TestCountRegressionResult, type TestCountRegressionOptions, type TestCountOctokitLike, TEST_FILE_PATTERNS, TEST_CASE_PATTERNS, isTestFile, countTestCasesInContent, decodeBase64Content, getTestFilesInBranch, countTestsInBranch, detectTestCountRegression, formatTestCountRegressionWarning, } from './test-count-regression';
export { type CommitAuthor, type AuthorshipResult, type AuthorshipOptions, type AuthorshipOctokitLike, tallyAuthors, getPrimaryAuthor, detectMixedAuthorship, formatAuthorshipAttribution, } from './authorship-attribution';
export { type MigrationPR, type SchemaMigrationResult, type SchemaMigrationOptions, type SchemaMigrationOctokitLike, DEFAULT_MIGRATION_PATTERNS, isMigrationFile, filterMigrationFiles, detectParallelMigrations, formatSchemaMigrationBlock, } from './schema-migration';
export { type StaleSpec, type SpecMismatchResult, type SpecMismatchOptions, type SpecMismatchOctokitLike, DEFAULT_SPEC_PATTERNS, isSpecFile, findBranchCutPoint, checkSpecStaleness, detectSpecMismatch, formatSpecMismatchWarning, } from './spec-version-mismatch';
export { type TeamDomain, type OwnershipCollision, type OwnershipCollisionResult, type OwnershipCollisionOptions, DEFAULT_DOMAINS, identifyBranchDomain, identifyFileDomain, detectFileCollision, detectOwnershipCollisions, formatOwnershipCollisionWarning, } from './ownership-collision';
export { type HandoffNotification, type HandoffResult, type HandoffOptions, API_CHANGE_PATTERNS, SCHEMA_CHANGE_PATTERNS, AUTH_CHANGE_PATTERNS, anyFileMatches, generateHandoffNotifications, } from './session-handoff';
export { type UnmetDependency, type MetDependency, type DependencyEnforcementResult, type DependencyEnforcementOptions, type DependencyOctokitLike, extractCurrentStoryId, parseDependencies, checkStoryMerged, enforceDependencies, formatDependencyBlock, } from './dependency-enforcement';
export { type FrontendPR, type ContractDivergenceResult, type ContractDivergenceOptions, type ContractDivergenceOctokitLike, API_CONTRACT_PATTERNS, FRONTEND_BRANCH_PATTERNS, isApiContractFile, filterApiContractFiles, isFrontendBranch, detectSuppression, detectContractDivergence, formatContractDivergenceBlock, } from './api-contract-divergence';
//# sourceMappingURL=index.d.ts.map