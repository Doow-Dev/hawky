/**
 * Baseline Hash Computation
 *
 * Computes stable hashes for violations using 5-line context.
 * The hash is: sha256(rule_id + ":" + normalized_5_line_context)
 *
 * This allows violations to be tracked even when line numbers shift
 * due to code changes elsewhere in the file.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Extract 5-line context around a violation.
 * Gets 2 lines before, the violation line, and 2 lines after.
 *
 * @param filePath - Path to the source file
 * @param lineNumber - 1-indexed line number of the violation
 * @returns The 5-line context as an array of strings, or null if file doesn't exist
 */
export function extractContext(filePath: string, lineNumber: number): string[] | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Convert to 0-indexed
    const zeroIndexedLine = lineNumber - 1;

    // Get 2 lines before and 2 lines after (5 total)
    const startLine = Math.max(0, zeroIndexedLine - 2);
    const endLine = Math.min(lines.length, zeroIndexedLine + 3); // +3 because slice end is exclusive

    return lines.slice(startLine, endLine);
  } catch {
    return null;
  }
}

/**
 * Normalize whitespace in context lines.
 * - Trims leading/trailing whitespace from each line
 * - Collapses multiple consecutive spaces to single space
 * - Joins lines with single space
 *
 * @param lines - Array of context lines
 * @returns Normalized context string
 */
export function normalizeContext(lines: string[]): string {
  return lines
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .join(' ')
    .trim();
}

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
export function computeHash(ruleId: string, filePath: string, lineNumber: number): string {
  const context = extractContext(filePath, lineNumber);

  if (context === null) {
    // File doesn't exist - use fallback hash
    return crypto
      .createHash('sha256')
      .update(`no-file:${ruleId}:${filePath}:${lineNumber}`)
      .digest('hex');
  }

  const normalizedContext = normalizeContext(context);
  return crypto.createHash('sha256').update(`${ruleId}:${normalizedContext}`).digest('hex');
}

/**
 * Compute hash with explicit error handling.
 * Used when we need to distinguish between file-not-found and read errors.
 *
 * @param ruleId - The rule that was violated
 * @param filePath - Path to the file
 * @param lineNumber - 1-indexed line number
 * @returns Object with hash and metadata
 */
export function computeHashWithMeta(
  ruleId: string,
  filePath: string,
  lineNumber: number
): { hash: string; fileExists: boolean; contextLines: number } {
  const context = extractContext(filePath, lineNumber);

  if (context === null) {
    return {
      hash: crypto
        .createHash('sha256')
        .update(`no-file:${ruleId}:${filePath}:${lineNumber}`)
        .digest('hex'),
      fileExists: false,
      contextLines: 0,
    };
  }

  const normalizedContext = normalizeContext(context);
  return {
    hash: crypto.createHash('sha256').update(`${ruleId}:${normalizedContext}`).digest('hex'),
    fileExists: true,
    contextLines: context.length,
  };
}
