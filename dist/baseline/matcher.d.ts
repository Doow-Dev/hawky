/**
 * Baseline Matcher
 *
 * Matches violations against the baseline to determine if they are new or existing.
 * Uses hash-based matching for stability across line number changes.
 */
import type { Baseline, MatchResult } from './types';
/**
 * Check if a violation exists in the baseline.
 *
 * @param ruleId - The rule that was violated
 * @param filePath - Path to the file containing the violation
 * @param lineNumber - 1-indexed line number of the violation
 * @param baseline - The baseline to check against
 * @returns MatchResult indicating if the violation is new or existing
 */
export declare function isExistingViolation(ruleId: string, filePath: string, lineNumber: number, baseline: Baseline): MatchResult;
/**
 * Batch check violations against baseline using a hash set for efficiency.
 * Use this when checking many violations against the same baseline.
 *
 * @param violations - Array of violations to check
 * @param baseline - The baseline to check against
 * @returns Array of MatchResults in the same order as input
 */
export declare function matchViolations(violations: Array<{
    ruleId: string;
    filePath: string;
    lineNumber: number;
}>, baseline: Baseline): MatchResult[];
/**
 * Filter violations to only new ones (not in baseline).
 *
 * @param violations - Array of violations with computed hashes
 * @param baseline - The baseline to check against
 * @returns Array of new violations
 */
export declare function filterNewViolations<T extends {
    hash: string;
}>(violations: T[], baseline: Baseline): T[];
/**
 * Partition violations into new and existing.
 *
 * @param violations - Array of violations with computed hashes
 * @param baseline - The baseline to check against
 * @returns Object with newViolations and existingViolations arrays
 */
export declare function partitionViolations<T extends {
    hash: string;
}>(violations: T[], baseline: Baseline): {
    newViolations: T[];
    existingViolations: T[];
};
/**
 * Create a matcher function bound to a specific baseline.
 * Useful when you need to check many violations without passing baseline each time.
 *
 * @param baseline - The baseline to bind
 * @returns Function that checks if a violation is new
 */
export declare function createMatcher(baseline: Baseline): (ruleId: string, filePath: string, lineNumber: number) => MatchResult;
//# sourceMappingURL=matcher.d.ts.map