/**
 * Report Types
 *
 * Type definitions for Hawky report generation.
 * Used by both PR comment and step summary reporters.
 */

import type { GateName } from '../config/types';
import type { GateResult, GateStatus } from '../gates/types';

/**
 * Summary of a single gate's results for reporting
 */
export interface GateSummary {
  /** Gate name */
  gate: GateName;

  /** Display name for the gate */
  displayName: string;

  /** Gate status */
  status: GateStatus;

  /** Number of new violations (blocking) */
  newViolations: number;

  /** Number of existing violations (in baseline) */
  existingViolations: number;

  /** Number of ignored violations (.hawkyignore) */
  ignoredViolations: number;

  /** Total violations (before filtering) */
  totalViolations: number;

  /** Execution time in milliseconds */
  timeMs: number;

  /** Whether this gate is blocking */
  blocking: boolean;

  /** Human-readable message */
  message: string;

  /** Error message if status is 'error' */
  error?: string | undefined;
}

/**
 * Overall report data structure
 */
export interface ReportData {
  /** Overall status of all gates */
  overallStatus: 'pass' | 'fail';

  /** Individual gate summaries */
  gates: GateSummary[];

  /** Number of gates that passed */
  gatesPassed: number;

  /** Number of gates that failed */
  gatesFailed: number;

  /** Number of gates that were skipped */
  gatesSkipped: number;

  /** Total execution time for all gates in milliseconds */
  totalTimeMs: number;

  /** Whether baseline is active */
  baselineActive: boolean;

  /** Number of violations in baseline (total across all gates) */
  baselineViolationCount: number;

  /** Whether grace period is active */
  gracePeriodActive: boolean;

  /** Grace period end date (if active) */
  gracePeriodEndDate?: string | undefined;

  /** Whether hawkyignore is active */
  hawkyignoreActive: boolean;

  /** Number of patterns in hawkyignore */
  hawkyignorePatternCount: number;

  /** Gates that were skipped due to fail-fast */
  failFastSkippedGates: GateName[];

  /** Gates that are disabled in config */
  disabledGates: GateName[];

  /** Git commit SHA */
  commitSha: string;

  /** Workflow run URL */
  workflowUrl: string;

  /** Repository (owner/repo) */
  repository: string;

  /** PR number (if in PR context) */
  prNumber?: number | undefined;
}

/**
 * Configuration for report generation
 */
export interface ReportConfig {
  /** Include collapsible sections for details */
  includeDetails: boolean;

  /** Include timing information */
  includeTiming: boolean;

  /** Include workflow link */
  includeWorkflowLink: boolean;

  /** Show baseline column even if no baseline */
  showBaselineColumn: boolean;

  /** Show ignored column even if no ignores */
  showIgnoredColumn: boolean;
}

/**
 * Default report configuration
 */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  includeDetails: true,
  includeTiming: true,
  includeWorkflowLink: true,
  showBaselineColumn: false,
  showIgnoredColumn: false,
};

/**
 * Convert GateResult to GateSummary
 */
export function gateResultToSummary(
  result: GateResult,
  displayName: string,
  blocking: boolean
): GateSummary {
  return {
    gate: result.gate,
    displayName,
    status: result.status,
    newViolations: result.newViolations,
    existingViolations: result.existingViolations,
    ignoredViolations: result.ignoredViolations,
    totalViolations: result.totalViolations,
    timeMs: result.timeMs,
    blocking,
    message: result.message,
    error: result.error,
  };
}

/**
 * Gate display names for reports
 */
export const GATE_DISPLAY_NAMES: Record<GateName, string> = {
  typescript: 'TypeScript',
  eslint: 'ESLint',
  semgrep: 'Semgrep',
  gitleaks: 'Gitleaks',
  build: 'Build',
  test: 'Test',
  'design-system': 'Design System',
};
