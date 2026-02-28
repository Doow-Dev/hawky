/**
 * Gates Module
 *
 * Exports all gate implementations and common types.
 */
export type { Annotation, AnnotationSeverity, Gate, GateResult, GateRunOptions, GateStatus, Violation, } from './types';
export { typescriptGate, parseTypeScriptOutput, violationToAnnotation, } from './typescript';
export { eslintGate, parseESLintOutput, parseESLintOutputWithSeverity, getChangedFiles, violationToAnnotation as eslintViolationToAnnotation, } from './eslint';
export { semgrepGate, parseSemgrepOutput, parseSemgrepOutputWithSeverity, getChangedFiles as semgrepGetChangedFiles, violationToAnnotation as semgrepViolationToAnnotation, } from './semgrep';
export { gitleaksGate, parseGitleaksOutput, getChangedFiles as gitleaksGetChangedFiles, violationToAnnotation as gitleaksViolationToAnnotation, } from './gitleaks';
//# sourceMappingURL=index.d.ts.map