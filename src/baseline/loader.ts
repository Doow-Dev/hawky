/**
 * Baseline Loader
 *
 * Loads and validates the .hawky/baseline.json file.
 * Handles missing baseline gracefully (returns null).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Baseline, BaselineLoadResult, BaselineViolation } from './types';

/** Default baseline file path relative to repo root */
const DEFAULT_BASELINE_PATH = '.hawky/baseline.json';

/** Valid gate names */
const VALID_GATES = ['typescript', 'eslint', 'semgrep', 'gitleaks'] as const;

/**
 * Validate that a violation object has all required fields.
 */
function isValidViolation(v: unknown): v is BaselineViolation {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  const rule = obj['rule'];
  const file = obj['file'];
  const lineHint = obj['line_hint'];
  const hash = obj['hash'];
  const gate = obj['gate'];
  const message = obj['message'];
  const firstSeen = obj['first_seen'];

  return (
    typeof rule === 'string' &&
    typeof file === 'string' &&
    typeof lineHint === 'number' &&
    typeof hash === 'string' &&
    typeof gate === 'string' &&
    VALID_GATES.includes(gate as typeof VALID_GATES[number]) &&
    typeof message === 'string' &&
    typeof firstSeen === 'string'
  );
}

/**
 * Validate the baseline JSON structure.
 */
function validateBaseline(data: unknown): { valid: boolean; error?: string; baseline?: Baseline } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Baseline must be an object' };
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  const version = obj['version'];
  if (typeof version !== 'string') {
    return { valid: false, error: 'Missing or invalid "version" field' };
  }

  const generatedAt = obj['generated_at'];
  if (typeof generatedAt !== 'string') {
    return { valid: false, error: 'Missing or invalid "generated_at" field' };
  }

  const branch = obj['branch'];
  if (typeof branch !== 'string') {
    return { valid: false, error: 'Missing or invalid "branch" field' };
  }

  const commit = obj['commit'];
  if (typeof commit !== 'string') {
    return { valid: false, error: 'Missing or invalid "commit" field' };
  }

  const violations = obj['violations'];
  if (!Array.isArray(violations)) {
    return { valid: false, error: 'Missing or invalid "violations" array' };
  }

  // Validate each violation
  for (let i = 0; i < violations.length; i++) {
    if (!isValidViolation(violations[i])) {
      return { valid: false, error: `Invalid violation at index ${i}` };
    }
  }

  // Build validated baseline
  const baseline: Baseline = {
    version,
    generated_at: generatedAt,
    branch,
    commit,
    violations: violations as BaselineViolation[],
  };

  // Optional summary
  const summary = obj['summary'];
  if (summary !== undefined) {
    baseline.summary = summary as Baseline['summary'];
  }

  // Optional suppressions
  const suppressions = obj['suppressions'];
  if (suppressions !== undefined) {
    baseline.suppressions = suppressions as Baseline['suppressions'];
  }

  return { valid: true, baseline };
}

/**
 * Load the baseline file from the specified path.
 *
 * @param baselinePath - Path to the baseline file (relative to cwd or absolute)
 * @returns BaselineLoadResult with the loaded baseline or error info
 */
export function loadBaseline(baselinePath: string = DEFAULT_BASELINE_PATH): BaselineLoadResult {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(baselinePath)
    ? baselinePath
    : path.resolve(process.cwd(), baselinePath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      found: false,
      baseline: null,
      path: absolutePath,
    };
  }

  try {
    // Read and parse JSON
    const content = fs.readFileSync(absolutePath, 'utf8');
    const data: unknown = JSON.parse(content);

    // Validate structure
    const validation = validateBaseline(data);
    if (!validation.valid || validation.baseline === undefined) {
      return {
        found: true,
        baseline: null,
        path: absolutePath,
        error: validation.error ?? 'Validation failed',
      };
    }

    return {
      found: true,
      baseline: validation.baseline,
      path: absolutePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      found: true,
      baseline: null,
      path: absolutePath,
      error: `Failed to parse baseline JSON: ${message}`,
    };
  }
}

/**
 * Load baseline from cwd using default path.
 * Convenience wrapper around loadBaseline().
 */
export function loadBaselineFromCwd(): BaselineLoadResult {
  return loadBaseline(DEFAULT_BASELINE_PATH);
}

/**
 * Get a Set of all violation hashes from a baseline.
 * Useful for fast lookup during violation matching.
 *
 * @param baseline - The baseline to extract hashes from
 * @returns Set of violation hash strings
 */
export function getHashSet(baseline: Baseline): Set<string> {
  return new Set(baseline.violations.map((v) => v.hash));
}

/**
 * Get violation count by gate.
 *
 * @param baseline - The baseline to analyze
 * @returns Object with counts per gate
 */
export function getViolationCounts(
  baseline: Baseline
): Record<'typescript' | 'eslint' | 'semgrep' | 'gitleaks' | 'total', number> {
  const counts = {
    typescript: 0,
    eslint: 0,
    semgrep: 0,
    gitleaks: 0,
    total: baseline.violations.length,
  };

  for (const v of baseline.violations) {
    const gate = v.gate;
    if (gate === 'typescript') counts.typescript++;
    else if (gate === 'eslint') counts.eslint++;
    else if (gate === 'semgrep') counts.semgrep++;
    else if (gate === 'gitleaks') counts.gitleaks++;
  }

  return counts;
}
