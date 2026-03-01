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
