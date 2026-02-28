/**
 * Gitleaks Gate
 *
 * Scans PR-changed files for hardcoded secrets using Gitleaks.
 * IMPORTANT: ALL secret findings are blocking (severity: 'error') — secrets should never pass.
 * Unlike other gates, even baselined secrets should trigger a warning.
 *
 * Gitleaks JSON format:
 * [{ RuleID, File, StartLine, StartColumn, Secret, Match, Description, ... }]
 */
import type { Gate, Violation, Annotation } from './types';
/**
 * Parse Gitleaks JSON output into violations
 * All findings are blocking (severity: 'error')
 */
export declare function parseGitleaksOutput(output: string, cwd: string): Violation[];
/**
 * Convert a violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: Violation, severity: 'error' | 'warning'): Annotation;
/**
 * Get changed files from git diff
 * Returns all files changed between base branch and HEAD
 */
export declare function getChangedFiles(cwd: string, baseBranch?: string): Promise<string[]>;
/**
 * Gitleaks Gate implementation
 */
export declare const gitleaksGate: Gate;
export default gitleaksGate;
//# sourceMappingURL=gitleaks.d.ts.map