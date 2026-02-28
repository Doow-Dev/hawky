/**
 * Hawkyignore Matcher
 *
 * Matches violations against .hawkyignore patterns.
 * Supports gitignore-style wildcards (*, **, ?).
 */

import type { IgnorePattern, IgnoreResult } from './types';

/**
 * Convert gitignore-style pattern to regex
 *
 * Supports:
 * - `*` - matches any characters except /
 * - `**` - matches any characters including /
 * - `?` - matches single character except /
 * - Leading `/` - anchors to root
 * - Trailing `/` - matches directory contents
 */
function patternToRegex(pattern: string): RegExp | null {
  if (!pattern) return null;

  // Escape special regex chars except * and ?
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Preserve ** as placeholder before handling *
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    // Single * matches any chars except path separator
    .replace(/\*/g, '[^/]*')
    // ? matches single char except path separator
    .replace(/\?/g, '[^/]')
    // ** matches anything including path separators
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  // If pattern doesn't start with /, match anywhere in path
  if (!pattern.startsWith('/')) {
    regex = '(^|/)' + regex;
  } else {
    // Remove leading / and anchor to start
    regex = '^' + regex.substring(1);
  }

  // If pattern ends with /, match directory contents
  if (pattern.endsWith('/')) {
    regex = regex + '.*';
  }

  // Anchor to end
  return new RegExp(regex + '$', 'i');
}

/**
 * Check if a file path matches a file pattern
 */
function matchesFilePattern(filePath: string, filePattern: string | null): boolean {
  if (!filePattern) return false;

  // Normalize path separators (Windows compatibility)
  const normalizedPath = filePath.replace(/\\/g, '/');
  const regex = patternToRegex(filePattern);

  return regex !== null && regex.test(normalizedPath);
}

/**
 * Check if a rule matches a rule pattern
 *
 * Supports exact match and wildcard match (e.g., eslint:* matches eslint:no-console)
 */
function matchesRulePattern(rule: string, rulePattern: string | null): boolean {
  if (!rulePattern) return false;

  // Exact match (case-insensitive)
  if (rule.toLowerCase() === rulePattern.toLowerCase()) {
    return true;
  }

  // Wildcard match using the same pattern-to-regex logic
  const regex = patternToRegex(rulePattern);
  return regex !== null && regex.test(rule);
}

/**
 * Check if a violation should be ignored
 *
 * @param filePath - Path to the file containing the violation
 * @param ruleId - Full rule ID with gate prefix (e.g., "eslint:no-console")
 * @param patterns - Parsed ignore patterns
 * @returns IgnoreResult indicating if the violation should be ignored
 */
export function shouldIgnore(
  filePath: string,
  ruleId: string,
  patterns: IgnorePattern[]
): IgnoreResult {
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'file':
        // File pattern only - matches any rule in matching files
        if (matchesFilePattern(filePath, pattern.filePattern)) {
          return {
            ignored: true,
            pattern,
            reason: pattern.raw,
          };
        }
        break;

      case 'rule':
        // Rule pattern only - matches this rule in any file
        if (matchesRulePattern(ruleId, pattern.rulePattern)) {
          return {
            ignored: true,
            pattern,
            reason: pattern.raw,
          };
        }
        break;

      case 'combined':
        // Both rule and file must match
        if (
          matchesRulePattern(ruleId, pattern.rulePattern) &&
          matchesFilePattern(filePath, pattern.filePattern)
        ) {
          return {
            ignored: true,
            pattern,
            reason: pattern.raw,
          };
        }
        break;
    }
  }

  return { ignored: false };
}

/**
 * Check multiple violations against ignore patterns
 *
 * @returns Array of results matching input violations
 */
export function checkViolations(
  violations: Array<{ filePath: string; ruleId: string }>,
  patterns: IgnorePattern[]
): IgnoreResult[] {
  return violations.map((v) => shouldIgnore(v.filePath, v.ruleId, patterns));
}

/**
 * Filter violations to only include non-ignored ones
 */
export function filterActiveViolations<T extends { filePath: string; ruleId: string }>(
  violations: T[],
  patterns: IgnorePattern[]
): T[] {
  return violations.filter((v) => !shouldIgnore(v.filePath, v.ruleId, patterns).ignored);
}

/**
 * Partition violations into ignored and active
 */
export function partitionViolations<T extends { filePath: string; ruleId: string }>(
  violations: T[],
  patterns: IgnorePattern[]
): { active: T[]; ignored: T[] } {
  const active: T[] = [];
  const ignored: T[] = [];

  for (const violation of violations) {
    if (shouldIgnore(violation.filePath, violation.ruleId, patterns).ignored) {
      ignored.push(violation);
    } else {
      active.push(violation);
    }
  }

  return { active, ignored };
}

/**
 * Create a bound matcher function for a set of patterns
 *
 * Useful when checking many violations against the same patterns
 */
export function createMatcher(
  patterns: IgnorePattern[]
): (filePath: string, ruleId: string) => IgnoreResult {
  return (filePath: string, ruleId: string) => shouldIgnore(filePath, ruleId, patterns);
}
