/**
 * TypeScript Gate
 *
 * Runs `tsc --noEmit` and reports type errors.
 * Integrates with baseline (existing vs new violations) and hawkyignore.
 *
 * Error format: file(line,col): error TSxxxx: message
 */
import type { Gate, Violation, Annotation } from './types';
/**
 * Parse TypeScript compiler output into violations
 */
export declare function parseTypeScriptOutput(output: string, cwd: string): Violation[];
/**
 * Convert a violation to a GitHub annotation
 * Uses the violation's severity if set, otherwise defaults to 'error'
 */
export declare function violationToAnnotation(violation: Violation): Annotation;
/**
 * TypeScript Gate implementation
 */
export declare const typescriptGate: Gate;
export default typescriptGate;
//# sourceMappingURL=typescript.d.ts.map