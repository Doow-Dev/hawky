/**
 * Baseline Hash Computation
 *
 * Computes stable hashes for violations using 5-line context.
 * The hash is: sha256(rule_id + ":" + normalized_5_line_context)
 *
 * This allows violations to be tracked even when line numbers shift
 * due to code changes elsewhere in the file.
 */
/**
 * Extract 5-line context around a violation.
 * Gets 2 lines before, the violation line, and 2 lines after.
 *
 * @param filePath - Path to the source file
 * @param lineNumber - 1-indexed line number of the violation
 * @returns The 5-line context as an array of strings, or null if file doesn't exist
 */
export declare function extractContext(filePath: string, lineNumber: number): string[] | null;
/**
 * Normalize whitespace in context lines.
 * - Trims leading/trailing whitespace from each line
 * - Collapses multiple consecutive spaces to single space
 * - Joins lines with single space
 *
 * @param lines - Array of context lines
 * @returns Normalized context string
 */
export declare function normalizeContext(lines: string[]): string;
/**
 * Compute a stable hash for a violation.
 * Uses SHA-256 of "ruleId:normalizedContext".
 *
 * If the file doesn't exist, falls back to hashing "no-file:ruleId:filePath:lineNumber".
 *
 * @param ruleId - The rule that was violated (e.g., "TS2322", "no-console")
 * @param filePath - Path to the file containing the violation
 * @param lineNumber - 1-indexed line number of the violation
 * @returns Hex-encoded SHA-256 hash
 */
export declare function computeHash(ruleId: string, filePath: string, lineNumber: number): string;
/**
 * Compute hash with explicit error handling.
 * Used when we need to distinguish between file-not-found and read errors.
 *
 * @param ruleId - The rule that was violated
 * @param filePath - Path to the file
 * @param lineNumber - 1-indexed line number
 * @returns Object with hash and metadata
 */
export declare function computeHashWithMeta(ruleId: string, filePath: string, lineNumber: number): {
    hash: string;
    fileExists: boolean;
    contextLines: number;
};
//# sourceMappingURL=hash.d.ts.map