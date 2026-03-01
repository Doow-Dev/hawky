/**
 * Gates Module
 *
 * Exports all gate implementations and common types.
 */

// Types
export type {
  Annotation,
  AnnotationSeverity,
  Gate,
  GateResult,
  GateRunOptions,
  GateStatus,
  Violation,
} from './types';

// TypeScript Gate
export {
  typescriptGate,
  parseTypeScriptOutput,
  violationToAnnotation,
} from './typescript';

// ESLint Gate
export {
  eslintGate,
  parseESLintOutput,
  parseESLintOutputWithSeverity,
  getChangedFiles,
  violationToAnnotation as eslintViolationToAnnotation,
} from './eslint';

// Semgrep Gate
export {
  semgrepGate,
  parseSemgrepOutput,
  parseSemgrepOutputWithSeverity,
  getChangedFiles as semgrepGetChangedFiles,
  violationToAnnotation as semgrepViolationToAnnotation,
} from './semgrep';

// Gitleaks Gate
export {
  gitleaksGate,
  parseGitleaksOutput,
  getChangedFiles as gitleaksGetChangedFiles,
  violationToAnnotation as gitleaksViolationToAnnotation,
} from './gitleaks';

// npm Audit Gate
export {
  npmAuditGate,
  parseNpmAuditOutput,
  violationToAnnotation as npmAuditViolationToAnnotation,
} from './npm-audit';

// Design System Gate
export {
  designSystemGate,
  scanForBannedClasses,
  scanForHardcodedColors,
  scanForSpacingViolations,
  scanForFontSizeViolations,
  violationToAnnotation as designSystemViolationToAnnotation,
} from './design-system';

// Frontend Checks Gate
export {
  frontendChecksGate,
  scanForUnhandledAsyncState,
  scanForMissingKeys,
  scanForMissingDependencies,
  violationToAnnotation as frontendChecksViolationToAnnotation,
} from './frontend-checks';
