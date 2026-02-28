/**
 * Baseline Matcher
 *
 * Matches violations against the baseline to determine if they are new or existing.
 * Uses hash-based matching for stability across line number changes.
 */

import type { Baseline, BaselineViolation, MatchResult } from './types';
import { computeHash } from './hash';
import { getHashSet } from './loader';

/**
 * Check if a violation exists in the baseline.
 *
 * @param ruleId - The rule that was violated
 * @param filePath - Path to the file containing the violation
 * @param lineNumber - 1-indexed line number of the violation
 * @param baseline - The baseline to check against
 * @returns MatchResult indicating if the violation is new or existing
 */
export function isExistingViolation(
  ruleId: string,
  filePath: string,
  lineNumber: number,
  baseline: Baseline
): MatchResult {
  const hash = computeHash(ruleId, filePath, lineNumber);

  // Find matching entry in baseline
  const matchedEntry = baseline.violations.find((v) => v.hash === hash);

  return {
    isNew: !matchedEntry,
    matchedEntry,
    hash,
  };
}

/**
 * Batch check violations against baseline using a hash set for efficiency.
 * Use this when checking many violations against the same baseline.
 *
 * @param violations - Array of violations to check
 * @param baseline - The baseline to check against
 * @returns Array of MatchResults in the same order as input
 */
export function matchViolations(
  violations: Array<{ ruleId: string; filePath: string; lineNumber: number }>,
  baseline: Baseline
): MatchResult[] {
  const hashSet = getHashSet(baseline);
  const hashToEntry = new Map<string, BaselineViolation>();

  // Build hash -> entry map for fast lookup
  for (const v of baseline.violations) {
    hashToEntry.set(v.hash, v);
  }

  return violations.map(({ ruleId, filePath, lineNumber }) => {
    const hash = computeHash(ruleId, filePath, lineNumber);
    const inBaseline = hashSet.has(hash);

    return {
      isNew: !inBaseline,
      matchedEntry: inBaseline ? hashToEntry.get(hash) : undefined,
      hash,
    };
  });
}

/**
 * Filter violations to only new ones (not in baseline).
 *
 * @param violations - Array of violations with computed hashes
 * @param baseline - The baseline to check against
 * @returns Array of new violations
 */
export function filterNewViolations<T extends { hash: string }>(
  violations: T[],
  baseline: Baseline
): T[] {
  const hashSet = getHashSet(baseline);
  return violations.filter((v) => !hashSet.has(v.hash));
}

/**
 * Partition violations into new and existing.
 *
 * @param violations - Array of violations with computed hashes
 * @param baseline - The baseline to check against
 * @returns Object with newViolations and existingViolations arrays
 */
export function partitionViolations<T extends { hash: string }>(
  violations: T[],
  baseline: Baseline
): { newViolations: T[]; existingViolations: T[] } {
  const hashSet = getHashSet(baseline);
  const newViolations: T[] = [];
  const existingViolations: T[] = [];

  for (const v of violations) {
    if (hashSet.has(v.hash)) {
      existingViolations.push(v);
    } else {
      newViolations.push(v);
    }
  }

  return { newViolations, existingViolations };
}

/**
 * Create a matcher function bound to a specific baseline.
 * Useful when you need to check many violations without passing baseline each time.
 *
 * @param baseline - The baseline to bind
 * @returns Function that checks if a violation is new
 */
export function createMatcher(
  baseline: Baseline
): (ruleId: string, filePath: string, lineNumber: number) => MatchResult {
  const hashSet = getHashSet(baseline);
  const hashToEntry = new Map<string, BaselineViolation>();

  for (const v of baseline.violations) {
    hashToEntry.set(v.hash, v);
  }

  return (ruleId: string, filePath: string, lineNumber: number): MatchResult => {
    const hash = computeHash(ruleId, filePath, lineNumber);
    const inBaseline = hashSet.has(hash);

    return {
      isNew: !inBaseline,
      matchedEntry: inBaseline ? hashToEntry.get(hash) : undefined,
      hash,
    };
  };
}
