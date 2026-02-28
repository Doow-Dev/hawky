/**
 * Baseline Types
 *
 * Type definitions for the Hawky baseline system.
 * The baseline tracks existing violations that are grandfathered in,
 * allowing only NEW violations to block PRs.
 */

/**
 * A single violation entry in the baseline.
 * Each violation is identified by a stable hash computed from
 * the rule ID and 5-line context around the violation.
 */
export interface BaselineViolation {
  /** The rule that was violated (e.g., "TS2322", "no-console", "semgrep-rule-id") */
  rule: string;

  /** Path to the file containing the violation (relative to repo root) */
  file: string;

  /** Approximate line number (may shift as code changes, hash is authoritative) */
  line_hint: number;

  /** Stable hash: sha256(rule_id + ":" + normalized_5_line_context) */
  hash: string;

  /** Which gate detected this violation */
  gate: 'typescript' | 'eslint' | 'semgrep' | 'gitleaks';

  /** Truncated message describing the violation */
  message: string;

  /** ISO timestamp when this violation was first recorded */
  first_seen: string;
}

/**
 * The baseline file structure (.hawky/baseline.json).
 * Contains all known violations that should be treated as existing (not blocking).
 */
export interface Baseline {
  /** Schema version for forward compatibility */
  version: string;

  /** ISO timestamp when the baseline was generated */
  generated_at: string;

  /** Branch the baseline was generated from */
  branch: string;

  /** Commit SHA the baseline was generated from */
  commit: string;

  /** Array of all tracked violations */
  violations: BaselineViolation[];

  /** Summary counts by gate (optional, for backward compatibility) */
  summary?:
    | {
        total: number;
        typescript: number;
        eslint: number;
        semgrep: number;
        gitleaks: number;
      }
    | undefined;

  /** Suppressions (hawk-ignore comments) - optional */
  suppressions?:
    | Array<{
        hash: string;
        file: string;
        line: number;
        rule?: string | undefined;
        reason?: string | undefined;
      }>
    | undefined;
}

/**
 * Result of loading a baseline file.
 */
export interface BaselineLoadResult {
  /** Whether a baseline file was found */
  found: boolean;

  /** The loaded baseline (null if not found or invalid) */
  baseline: Baseline | null;

  /** Path to the baseline file (if found) */
  path?: string | undefined;

  /** Error message if loading failed */
  error?: string | undefined;
}

/**
 * Result of matching a violation against the baseline.
 */
export interface MatchResult {
  /** Whether the violation is new (not in baseline) */
  isNew: boolean;

  /** The matched baseline entry (if found) */
  matchedEntry?: BaselineViolation | undefined;

  /** The computed hash for this violation */
  hash: string;
}
