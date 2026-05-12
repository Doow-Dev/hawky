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
  scanForRerenderTraps,
  scanForServerClientBoundary,
  scanForA11yIssues,
  calculateBundleDelta,
  scanForImageWithoutDimensions,
  scanForTypeScriptStrictIssues,
  buildDependencyGraph,
  detectCycles,
  scanForImportCycles,
  buildComponentGraph,
  analyzeComponentGraphImpact,
  scanForImportPathInconsistency,
  violationToAnnotation as frontendViolationToAnnotation,
  type BundleSizeDelta,
  type ComponentGraphEntry,
} from './frontend-checks';

// Visual Gate
export {
  visualGate,
  runVisualGate,
  resultToAnnotation as visualResultToAnnotation,
} from './visual';

// Backend Checks Gate
export {
  backendChecksGate,
  scanForPrismaInService,
  scanForPrismaServiceInjection,
  scanForMissingDtoValidators,
  scanForUnprotectedControllers,
  scanForConsoleInService,
  scanForSilentCatch,
  scanForUnboundedFindMany,
  scanForNPlusOneQueries,
} from './backend-checks';

// LLM Review Gate
export {
  createLLMReviewGate,
  runLLMReviewGate,
  type LLMReviewGateOptions,
} from './llm-review';
