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
