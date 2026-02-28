/**
 * Hawkyignore Matcher
 *
 * Matches violations against .hawkyignore patterns.
 * Supports gitignore-style wildcards (*, **, ?).
 */
import type { IgnorePattern, IgnoreResult } from './types';
/**
 * Check if a violation should be ignored
 *
 * @param filePath - Path to the file containing the violation
 * @param ruleId - Full rule ID with gate prefix (e.g., "eslint:no-console")
 * @param patterns - Parsed ignore patterns
 * @returns IgnoreResult indicating if the violation should be ignored
 */
export declare function shouldIgnore(filePath: string, ruleId: string, patterns: IgnorePattern[]): IgnoreResult;
/**
 * Check multiple violations against ignore patterns
 *
 * @returns Array of results matching input violations
 */
export declare function checkViolations(violations: Array<{
    filePath: string;
    ruleId: string;
}>, patterns: IgnorePattern[]): IgnoreResult[];
/**
 * Filter violations to only include non-ignored ones
 */
export declare function filterActiveViolations<T extends {
    filePath: string;
    ruleId: string;
}>(violations: T[], patterns: IgnorePattern[]): T[];
/**
 * Partition violations into ignored and active
 */
export declare function partitionViolations<T extends {
    filePath: string;
    ruleId: string;
}>(violations: T[], patterns: IgnorePattern[]): {
    active: T[];
    ignored: T[];
};
/**
 * Create a bound matcher function for a set of patterns
 *
 * Useful when checking many violations against the same patterns
 */
export declare function createMatcher(patterns: IgnorePattern[]): (filePath: string, ruleId: string) => IgnoreResult;
//# sourceMappingURL=matcher.d.ts.map