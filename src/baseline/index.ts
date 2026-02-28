/**
 * Baseline Module
 *
 * Exports all baseline-related functionality.
 */

// Types
export type {
  Baseline,
  BaselineViolation,
  BaselineLoadResult,
  MatchResult,
} from './types';

// Hash computation
export {
  computeHash,
  computeHashWithMeta,
  extractContext,
  normalizeContext,
} from './hash';

// Loader
export {
  loadBaseline,
  loadBaselineFromCwd,
  getHashSet,
  getViolationCounts,
} from './loader';

// Matcher
export {
  isExistingViolation,
  matchViolations,
  filterNewViolations,
  partitionViolations,
  createMatcher,
} from './matcher';

// Generator (for baseline mode)
export type { GeneratorOptions, GeneratorResult } from './generator';
export { generateBaseline, generateBaselineFromCwd } from './generator';
