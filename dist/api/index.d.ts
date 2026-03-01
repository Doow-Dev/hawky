/**
 * API Contract Validation Module
 *
 * Tools for parsing and validating OpenAPI specifications.
 */
export { type HttpMethod, type ParameterLocation, type SpecParameter, type SpecResponse, type SchemaObject, type SpecEndpoint, type SpecErrorCode, type ParsedSpec, type ParseResult, HTTP_METHODS, isOpenApiSpec, findSpecFiles, parseSpec, getStatusCodes, getEndpointsByTag, getErrorResponses, } from './spec-parser';
export { type ImplementedError, type ErrorCoverageResult, findImplementedErrors, getUniqueImplementedCodes, checkErrorCoverage, groupErrorsByCode, formatCoverageReport, } from './error-coverage';
export { type FileModTime, type FreshnessResult, getFileModTime, findSourceFiles, findApiSourceDirs, checkSpecFreshness, formatFreshnessReport, getFreshnessStatus, } from './spec-freshness';
export { type NormalizedType, type NormalizedProperty, type DiffKind, type SchemaDiff, type ExtractedHandler, type ContractViolation, type DifferResult, type DifferOptions, normalizeOpenApiSchema, normalizeTypeScriptType, extractHandlers, compareTypes, typeToString, matchHandlersToEndpoints, findHandlerFiles, runDiffer, formatDifferReport, } from './response-differ';
export { type TestGeneratorOptions, type GeneratedTestFile, type TestGeneratorResult, generateTests, generateAndWriteTests, formatTestGeneratorReport, } from './test-generator';
//# sourceMappingURL=index.d.ts.map