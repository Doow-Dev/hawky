/**
 * Error Code Coverage Check
 *
 * Compare error codes defined in OpenAPI spec vs actual implementation.
 * Detects undocumented error responses and unused documented errors.
 */
import type { ParsedSpec, SpecErrorCode } from './spec-parser';
/**
 * Error code found in implementation
 */
export interface ImplementedError {
    statusCode: string;
    file: string;
    line: number;
    context?: string;
}
/**
 * Coverage analysis result
 */
export interface ErrorCoverageResult {
    /** Total documented error codes */
    documentedCount: number;
    /** Total implemented error codes */
    implementedCount: number;
    /** Error codes in spec but not found in implementation */
    undocumented: ImplementedError[];
    /** Error codes in implementation but not in spec */
    missing: SpecErrorCode[];
    /** Coverage percentage (documented / implemented) */
    coveragePercentage: number;
}
/**
 * Find error codes used in source files
 */
export declare function findImplementedErrors(sourceDir: string, extensions?: string[]): ImplementedError[];
/**
 * Get unique status codes from implemented errors
 */
export declare function getUniqueImplementedCodes(errors: ImplementedError[]): string[];
/**
 * Check error code coverage between spec and implementation
 */
export declare function checkErrorCoverage(spec: ParsedSpec, sourceDir: string): ErrorCoverageResult;
/**
 * Group errors by status code
 */
export declare function groupErrorsByCode(errors: ImplementedError[]): Map<string, ImplementedError[]>;
/**
 * Format coverage result as markdown
 */
export declare function formatCoverageReport(result: ErrorCoverageResult): string;
//# sourceMappingURL=error-coverage.d.ts.map