/**
 * Hawkyignore Parser
 *
 * Parses .hawkyignore files from the repository root.
 * Supports three pattern formats:
 * - File patterns: `legacy/**`, `*.generated.ts`
 * - Rule patterns: `eslint:no-console`, `semgrep:rule.id`
 * - Combined: `semgrep:rule.id:test/**`
 */
import type { IgnorePattern, IgnoreLoadResult, IgnoreParseWarning, IgnorePatternSummary } from './types';
/**
 * Parse .hawkyignore file content
 */
export declare function parseIgnoreContent(content: string): {
    patterns: IgnorePattern[];
    warnings: IgnoreParseWarning[];
};
/**
 * Load and parse .hawkyignore from the specified directory
 */
export declare function loadIgnoreFile(cwd?: string): IgnoreLoadResult;
/**
 * Load .hawkyignore from current working directory
 */
export declare function loadIgnoreFromCwd(): IgnoreLoadResult;
/**
 * Get summary of patterns by type
 */
export declare function getPatternSummary(patterns: IgnorePattern[]): IgnorePatternSummary;
//# sourceMappingURL=parser.d.ts.map