/**
 * Baseline Module
 *
 * Exports all baseline-related functionality.
 */
export type { Baseline, BaselineViolation, BaselineLoadResult, MatchResult, } from './types';
export { computeHash, computeHashWithMeta, extractContext, normalizeContext, } from './hash';
export { loadBaseline, loadBaselineFromCwd, getHashSet, getViolationCounts, } from './loader';
export { isExistingViolation, matchViolations, filterNewViolations, partitionViolations, createMatcher, } from './matcher';
//# sourceMappingURL=index.d.ts.map