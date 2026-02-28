/**
 * Semgrep Gate
 *
 * Runs Semgrep security scanning on PR-changed files.
 * - High/Error severity findings are blocking
 * - Medium/Warning severity findings are non-blocking (warnings)
 * - Low/Info severity findings are informational
 * - Integrates with baseline and hawkyignore
 *
 * Semgrep JSON format:
 * { results: [{ check_id, path, start: { line, col }, extra: { severity, message } }], errors: [] }
 */
import type { Gate, Violation, Annotation } from './types';
/**
 * Parse Semgrep JSON output into violations
 */
export declare function parseSemgrepOutput(output: string, cwd: string): Violation[];
/**
 * Parse Semgrep output and separate by severity
 */
export declare function parseSemgrepOutputWithSeverity(output: string, cwd: string): {
    errors: Violation[];
    warnings: Violation[];
};
/**
 * Convert a violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: Violation, severity: 'error' | 'warning'): Annotation;
/**
 * Get changed files from git diff
 * Returns scannable files changed between base branch and HEAD
 */
export declare function getChangedFiles(cwd: string, baseBranch?: string): Promise<string[]>;
/**
 * Semgrep Gate implementation
 */
export declare const semgrepGate: Gate;
export default semgrepGate;
//# sourceMappingURL=semgrep.d.ts.map