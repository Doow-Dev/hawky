/**
 * npm Audit Gate
 *
 * Runs `npm audit` to detect known vulnerabilities in dependencies.
 * - Critical/High severity findings are blocking by default
 * - Medium/Low severity findings are non-blocking (warnings)
 * - Configurable severity threshold via environment variable
 *
 * npm audit JSON format (v7+):
 * { vulnerabilities: { [name]: { name, severity, via, effects, ... } }, metadata: { ... } }
 */
import type { Gate, Violation, Annotation } from './types';
/**
 * Severity levels from npm audit
 */
type NpmAuditSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
/**
 * Parse npm audit JSON output into violations
 */
export declare function parseNpmAuditOutput(output: string, blockingThreshold: NpmAuditSeverity): {
    violations: Violation[];
    errors: Violation[];
    warnings: Violation[];
};
/**
 * Convert a violation to a GitHub annotation
 */
export declare function violationToAnnotation(violation: Violation, severity: 'error' | 'warning'): Annotation;
/**
 * npm Audit Gate implementation
 */
export declare const npmAuditGate: Gate;
export default npmAuditGate;
//# sourceMappingURL=npm-audit.d.ts.map