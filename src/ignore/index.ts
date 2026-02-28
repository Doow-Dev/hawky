/**
 * Hawkyignore Module
 *
 * Parses .hawkyignore files for suppressing specific violations.
 *
 * Usage:
 * ```typescript
 * import { loadIgnoreFromCwd, shouldIgnore, createMatcher } from './ignore';
 *
 * // Load patterns at action start
 * const { patterns, found } = loadIgnoreFromCwd();
 *
 * // Check individual violations
 * const result = shouldIgnore('src/legacy.ts', 'eslint:no-console', patterns);
 * // result.ignored === true means violation should be suppressed
 * // result.reason contains the matching pattern line
 *
 * // Or create a bound matcher for efficiency
 * const matcher = createMatcher(patterns);
 * const result2 = matcher('src/legacy.ts', 'eslint:no-console');
 * ```
 */

// Types
export type {
  IgnorePatternType,
  IgnorePattern,
  IgnoreResult,
  IgnoreLoadResult,
  IgnoreParseWarning,
  IgnorePatternSummary,
} from './types';

// Parser
export {
  loadIgnoreFile,
  loadIgnoreFromCwd,
  parseIgnoreContent,
  getPatternSummary,
} from './parser';

// Matcher
export {
  shouldIgnore,
  checkViolations,
  filterActiveViolations,
  partitionViolations,
  createMatcher,
} from './matcher';
