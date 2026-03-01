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
export { npmAuditGate, parseNpmAuditOutput, violationToAnnotation as npmAuditViolationToAnnotation, } from './npm-audit';
export { designSystemGate, scanForBannedClasses, scanForHardcodedColors, scanForSpacingViolations, scanForFontSizeViolations, violationToAnnotation as designSystemViolationToAnnotation, } from './design-system';
export { frontendChecksGate, scanForUnhandledAsyncState, scanForMissingKeys, scanForMissingDependencies, violationToAnnotation as frontendChecksViolationToAnnotation, } from './frontend-checks';
//# sourceMappingURL=index.d.ts.map