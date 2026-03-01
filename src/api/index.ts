/**
 * API Contract Validation Module
 *
 * Tools for parsing and validating OpenAPI specifications.
 */

export {
  // Types
  type HttpMethod,
  type ParameterLocation,
  type SpecParameter,
  type SpecResponse,
  type SchemaObject,
  type SpecEndpoint,
  type SpecErrorCode,
  type ParsedSpec,
  type ParseResult,
  // Constants
  HTTP_METHODS,
  // Functions
  isOpenApiSpec,
  findSpecFiles,
  parseSpec,
  getStatusCodes,
  getEndpointsByTag,
  getErrorResponses,
} from './spec-parser';

export {
  // Types
  type ImplementedError,
  type ErrorCoverageResult,
  // Functions
  findImplementedErrors,
  getUniqueImplementedCodes,
  checkErrorCoverage,
  groupErrorsByCode,
  formatCoverageReport,
} from './error-coverage';

export {
  // Types
  type FileModTime,
  type FreshnessResult,
  // Functions
  getFileModTime,
  findSourceFiles,
  findApiSourceDirs,
  checkSpecFreshness,
  formatFreshnessReport,
  getFreshnessStatus,
} from './spec-freshness';

export {
  // Types
  type NormalizedType,
  type NormalizedProperty,
  type DiffKind,
  type SchemaDiff,
  type ExtractedHandler,
  type ContractViolation,
  type DifferResult,
  type DifferOptions,
  // Functions
  normalizeOpenApiSchema,
  normalizeTypeScriptType,
  extractHandlers,
  compareTypes,
  typeToString,
  matchHandlersToEndpoints,
  findHandlerFiles,
  runDiffer,
  formatDifferReport,
} from './response-differ';

export {
  // Types
  type TestGeneratorOptions,
  type GeneratedTestFile,
  type TestGeneratorResult,
  // Functions
  generateTests,
  generateAndWriteTests,
  formatTestGeneratorReport,
} from './test-generator';

export {
  // Types
  type DocumentedEndpoint,
  type DocumentedField,
  type ParsedContracts,
  type DriftKind,
  type DriftViolation,
  type DriftResult,
  type ParseContractsOptions,
  type ParseContractsResult,
  type ContractsCheckOptions,
  type ContractsCheckResult,
  // Constants
  CONTRACT_FILE_LOCATIONS,
  // Functions
  findContractsFile,
  parseContractsFile,
  parseContracts,
  detectDrift,
  checkContractsIntegration,
  formatDriftReport,
} from './contracts-integration';
