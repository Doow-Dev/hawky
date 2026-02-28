/**
 * Gate Types
 *
 * Common type definitions for all Hawky gates.
 * Each gate produces a GateResult that can be aggregated for reporting.
 */

import type { GateName } from '../config/types';

/**
 * Severity level for annotations
 */
export type AnnotationSeverity = 'error' | 'warning' | 'notice';

/**
 * A single annotation to display in GitHub PR
 * Maps to GitHub's annotation format for check runs
 */
export interface Annotation {
  /** File path (relative to repo root) */
  file: string;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed, optional) */
  column?: number;

  /** End line number (for multi-line annotations) */
  endLine?: number;

  /** End column number */
  endColumn?: number;

  /** Human-readable message */
  message: string;

  /** Severity level */
  severity: AnnotationSeverity;

  /** Rule ID that was violated (e.g., "TS2322", "no-console") */
  ruleId: string;

  /** Title for the annotation (optional, defaults to ruleId) */
  title?: string;
}

/**
 * Status of a gate execution
 */
export type GateStatus = 'pass' | 'fail' | 'skip' | 'error';

/**
 * A violation detected by a gate
 * Used for baseline matching and ignore filtering
 */
export interface Violation {
  /** Rule ID (e.g., "TS2322", "no-console", "semgrep-rule-id") */
  ruleId: string;

  /** File path (relative to repo root) */
  file: string;

  /** Line number (1-indexed) */
  line: number;

  /** Column number (1-indexed, optional) */
  column?: number;

  /** Human-readable message */
  message: string;

  /** Which gate detected this */
  gate: GateName;
}

/**
 * Result of running a single gate
 */
export interface GateResult {
  /** Which gate produced this result */
  gate: GateName;

  /** Overall status */
  status: GateStatus;

  /** All violations detected (before filtering) */
  totalViolations: number;

  /** Violations that are new (not in baseline) */
  newViolations: number;

  /** Violations that exist in baseline (grandfathered) */
  existingViolations: number;

  /** Violations ignored via .hawkyignore */
  ignoredViolations: number;

  /** Annotations to display in GitHub PR */
  annotations: Annotation[];

  /** All violations (for baseline generation and reporting) */
  violations: Violation[];

  /** Execution time in milliseconds */
  timeMs: number;

  /** Human-readable message about the result */
  message: string;

  /** Raw output from the tool (for debugging) */
  rawOutput?: string;

  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Options passed to gate runners
 */
export interface GateRunOptions {
  /** Working directory (usually repo root) */
  cwd: string;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Whether to create GitHub annotations */
  createAnnotations: boolean;
}

/**
 * Common interface for all gate modules
 */
export interface Gate {
  /** Gate identifier */
  name: GateName;

  /** Human-readable display name */
  displayName: string;

  /** Run the gate and return results */
  run(options: GateRunOptions): Promise<GateResult>;

  /** Check if the gate can run (e.g., tsconfig.json exists) */
  canRun(cwd: string): Promise<boolean>;
}
