/**
 * Hawkyignore Types
 *
 * Type definitions for .hawkyignore file parsing and pattern matching.
 * Supports three pattern types:
 * - File patterns: `legacy/**`, `*.generated.ts`
 * - Rule patterns: `eslint:no-console`, `semgrep:rule.id`
 * - Combined: `semgrep:rule.id:test/**`
 */
/**
 * Pattern type in .hawkyignore file
 */
export type IgnorePatternType = 'file' | 'rule' | 'combined';
/**
 * A parsed ignore pattern from .hawkyignore
 */
export interface IgnorePattern {
    /** Pattern type */
    type: IgnorePatternType;
    /** File glob pattern (for 'file' and 'combined' types) */
    filePattern: string | null;
    /** Rule pattern with gate prefix (for 'rule' and 'combined' types) */
    rulePattern: string | null;
    /** Line number in .hawkyignore file (1-indexed) */
    line: number;
    /** Raw line from .hawkyignore file */
    raw: string;
}
/**
 * Result of checking if a violation should be ignored
 */
export interface IgnoreResult {
    /** Whether the violation should be ignored */
    ignored: boolean;
    /** The matching pattern (if ignored) */
    pattern?: IgnorePattern;
    /** Human-readable reason (the raw pattern line) */
    reason?: string;
}
/**
 * Result of loading .hawkyignore file
 */
export interface IgnoreLoadResult {
    /** Whether .hawkyignore file was found */
    found: boolean;
    /** Path to .hawkyignore file (if found) */
    path?: string;
    /** Parsed patterns */
    patterns: IgnorePattern[];
    /** Any parse warnings (e.g., malformed lines) */
    warnings: IgnoreParseWarning[];
}
/**
 * Warning from parsing .hawkyignore
 */
export interface IgnoreParseWarning {
    /** Line number (1-indexed) */
    line: number;
    /** Warning message */
    message: string;
    /** Raw line content */
    raw: string;
}
/**
 * Summary of loaded patterns by type
 */
export interface IgnorePatternSummary {
    /** Total number of patterns */
    total: number;
    /** Number of file-only patterns */
    filePatterns: number;
    /** Number of rule-only patterns */
    rulePatterns: number;
    /** Number of combined patterns */
    combinedPatterns: number;
}
//# sourceMappingURL=types.d.ts.map