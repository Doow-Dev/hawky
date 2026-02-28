/**
 * Hawkyignore Parser
 *
 * Parses .hawkyignore files from the repository root.
 * Supports three pattern formats:
 * - File patterns: `legacy/**`, `*.generated.ts`
 * - Rule patterns: `eslint:no-console`, `semgrep:rule.id`
 * - Combined: `semgrep:rule.id:test/**`
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  IgnorePattern,
  IgnoreLoadResult,
  IgnoreParseWarning,
  IgnorePatternSummary,
} from './types';

/**
 * Known gate prefixes for identifying rule patterns
 */
const KNOWN_GATES = ['eslint', 'typescript', 'ts', 'semgrep', 'gitleaks'];

/**
 * Default .hawkyignore file name
 */
const DEFAULT_IGNORE_FILE = '.hawkyignore';

/**
 * Parse a single line from .hawkyignore
 *
 * Format rules:
 * - Single path: `legacy/**` -> file pattern
 * - gate:rule: `eslint:no-console` -> rule pattern (all files)
 * - gate:rule:path: `semgrep:rule.id:test/**` -> combined pattern
 */
function parseLine(line: string, lineNumber: number): IgnorePattern | null {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const parts = trimmed.split(':');

  if (parts.length === 1) {
    // Just a file pattern (e.g., "legacy/**", "*.generated.ts")
    // parts[0] is guaranteed to exist since length >= 1
    const filePattern = parts[0] as string;
    return {
      type: 'file',
      filePattern,
      rulePattern: null,
      line: lineNumber,
      raw: trimmed,
    };
  } else if (parts.length === 2) {
    // Could be gate:rule or file with colon in name
    // parts[0] is guaranteed to exist since length >= 2
    const gate = (parts[0] as string).toLowerCase();

    if (KNOWN_GATES.includes(gate)) {
      // gate:rule - applies to all files
      return {
        type: 'rule',
        filePattern: null,
        rulePattern: trimmed, // Keep full gate:rule
        line: lineNumber,
        raw: trimmed,
      };
    } else {
      // Treat as file pattern with colon in name (rare but possible)
      return {
        type: 'file',
        filePattern: trimmed,
        rulePattern: null,
        line: lineNumber,
        raw: trimmed,
      };
    }
  } else {
    // 3+ parts: gate:rule:path pattern
    // e.g., semgrep:javascript.lang.security.audit.*:test/**
    // parts[0] and parts[parts.length - 1] are guaranteed to exist since length >= 3
    const gate = parts[0] as string;
    const ruleId = parts.slice(1, -1).join(':'); // Rule ID may contain colons
    const filePattern = parts[parts.length - 1] as string;

    return {
      type: 'combined',
      filePattern,
      rulePattern: `${gate}:${ruleId}`,
      line: lineNumber,
      raw: trimmed,
    };
  }
}

/**
 * Parse .hawkyignore file content
 */
export function parseIgnoreContent(content: string): {
  patterns: IgnorePattern[];
  warnings: IgnoreParseWarning[];
} {
  const patterns: IgnorePattern[] = [];
  const warnings: IgnoreParseWarning[] = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1; // 1-indexed
    const line = lines[i] as string; // Guaranteed to exist since i < lines.length

    try {
      const pattern = parseLine(line, lineNumber);
      if (pattern) {
        patterns.push(pattern);
      }
    } catch (error) {
      warnings.push({
        line: lineNumber,
        message: error instanceof Error ? error.message : 'Unknown parse error',
        raw: line,
      });
    }
  }

  return { patterns, warnings };
}

/**
 * Load and parse .hawkyignore from the specified directory
 */
export function loadIgnoreFile(cwd: string = process.cwd()): IgnoreLoadResult {
  const ignorePath = path.join(cwd, DEFAULT_IGNORE_FILE);

  // Check if file exists
  if (!fs.existsSync(ignorePath)) {
    return {
      found: false,
      patterns: [],
      warnings: [],
    };
  }

  try {
    const content = fs.readFileSync(ignorePath, 'utf8');
    const { patterns, warnings } = parseIgnoreContent(content);

    return {
      found: true,
      path: ignorePath,
      patterns,
      warnings,
    };
  } catch (error) {
    // File exists but couldn't be read
    return {
      found: true,
      path: ignorePath,
      patterns: [],
      warnings: [
        {
          line: 0,
          message: error instanceof Error ? error.message : 'Failed to read file',
          raw: '',
        },
      ],
    };
  }
}

/**
 * Load .hawkyignore from current working directory
 */
export function loadIgnoreFromCwd(): IgnoreLoadResult {
  return loadIgnoreFile(process.cwd());
}

/**
 * Get summary of patterns by type
 */
export function getPatternSummary(patterns: IgnorePattern[]): IgnorePatternSummary {
  return {
    total: patterns.length,
    filePatterns: patterns.filter((p) => p.type === 'file').length,
    rulePatterns: patterns.filter((p) => p.type === 'rule').length,
    combinedPatterns: patterns.filter((p) => p.type === 'combined').length,
  };
}
