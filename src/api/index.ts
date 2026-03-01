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
