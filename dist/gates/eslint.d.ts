/**
 * ESLint Gate
 *
 * Runs ESLint with `--format json` on PR-changed files.
 * - Errors (severity 2) are blocking
 * - Warnings (severity 1) are non-blocking
 * - Integrates with baseline and hawkyignore
 *
 * ESLint JSON format:
 * [{ filePath, messages: [{ ruleId, severity, message, line, column }], errorCount, warningCount }]
 */
import type { Gate, Violation, Annotation } from './types';
/**
 * Parse ESLint JSON output into violations
 */
export declare function parseESLintOutput(output: string, cwd: string): Violation[];
/**
 * Parse ESLint output and separate errors from warnings
 */
export declare function parseESLintOutputWithSeverity(output: string, cwd: string): {
    errors: Violation[];
    warnings: Violation[];
};
/**
 * Convert a violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: Violation, severity: 'error' | 'warning'): Annotation;
/**
 * Get changed files from git diff
 * Returns JS/TS files changed between base branch and HEAD
 */
export declare function getChangedFiles(cwd: string, baseBranch?: string): Promise<string[]>;
/**
 * ESLint Gate implementation
 */
export declare const eslintGate: Gate;
export default eslintGate;
//# sourceMappingURL=eslint.d.ts.map