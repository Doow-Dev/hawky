/**
 * Response Shape Differ
 *
 * Compares OpenAPI spec response schemas against TypeScript implementation
 * to detect API contract violations. This is the core of E003 API Contract Validation.
 *
 * Strategy:
 * 1. Parse OpenAPI spec to get expected response schemas
 * 2. Parse TypeScript handlers to extract return types
 * 3. Normalize both to a common schema format
 * 4. Diff and report violations
 */
import * as ts from 'typescript';
import type { SchemaObject, SpecEndpoint, ParsedSpec } from './spec-parser';
/**
 * Normalized type representation for comparison
 * Both OpenAPI schemas and TypeScript types normalize to this
 */
export interface NormalizedType {
    /** Base type */
    kind: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'array' | 'object' | 'union' | 'unknown' | 'any' | 'void' | 'never';
    /** For arrays: element type */
    elementType?: NormalizedType;
    /** For objects: property definitions */
    properties?: Record<string, NormalizedProperty>;
    /** For unions: member types */
    unionTypes?: NormalizedType[];
    /** Original type name (for references) */
    typeName?: string;
    /** String format (date, email, etc.) */
    format?: string;
    /** Enum values if applicable */
    enumValues?: unknown[];
    /** Whether this is nullable */
    nullable?: boolean;
}
/**
 * Property in a normalized object type
 */
export interface NormalizedProperty {
    type: NormalizedType;
    required: boolean;
    description?: string;
}
/**
 * Difference between expected and actual types
 */
export type DiffKind = 'missing_field' | 'extra_field' | 'type_mismatch' | 'required_mismatch' | 'array_element_mismatch' | 'enum_mismatch' | 'nullable_mismatch';
/**
 * A single difference found
 */
export interface SchemaDiff {
    /** Type of difference */
    kind: DiffKind;
    /** Path to the difference (e.g., "user.address.street") */
    path: string;
    /** Expected type/value from spec */
    expected: string;
    /** Actual type/value from implementation */
    actual: string;
    /** Severity: breaking changes are errors, non-breaking are warnings */
    severity: 'error' | 'warning';
    /** Human-readable message */
    message: string;
}
/**
 * Handler extracted from TypeScript source
 */
export interface ExtractedHandler {
    /** Handler function/method name */
    name: string;
    /** File path */
    file: string;
    /** Line number where handler starts */
    line: number;
    /** HTTP method (if detectable) */
    method?: string;
    /** Route path (if detectable) */
    routePath?: string;
    /** Return type as NormalizedType */
    returnType?: NormalizedType;
    /** Raw return type string for reporting */
    returnTypeString?: string;
    /** Operation ID if found in comments/decorators */
    operationId?: string;
}
/**
 * API contract violation
 */
export interface ContractViolation {
    /** Rule ID for this violation type */
    ruleId: string;
    /** File where violation occurs */
    file: string;
    /** Line number */
    line: number;
    /** Column (optional) */
    column?: number;
    /** Human-readable message */
    message: string;
    /** Severity */
    severity: 'error' | 'warning';
    /** API endpoint this relates to */
    endpoint?: {
        method: string;
        path: string;
    };
    /** Detailed diff information */
    diff?: SchemaDiff;
}
/**
 * Result of comparing spec to implementation
 */
export interface DifferResult {
    /** All violations found */
    violations: ContractViolation[];
    /** Handlers that couldn't be matched to spec endpoints */
    unmatchedHandlers: ExtractedHandler[];
    /** Spec endpoints that couldn't be matched to handlers */
    unmatchedEndpoints: SpecEndpoint[];
    /** Summary stats */
    stats: {
        totalHandlers: number;
        matchedHandlers: number;
        totalEndpoints: number;
        matchedEndpoints: number;
        violations: number;
        errors: number;
        warnings: number;
    };
}
/**
 * Options for the differ
 */
export interface DifferOptions {
    /** Treat extra fields in implementation as errors (default: false = warnings) */
    strictExtraFields?: boolean;
    /** Ignore endpoints without handlers (default: false) */
    ignoreUnmatchedEndpoints?: boolean;
    /** Ignore handlers without spec endpoints (default: false) */
    ignoreUnmatchedHandlers?: boolean;
    /** File patterns for API handlers */
    handlerPatterns?: string[];
    /** Status codes to check (default: all) */
    statusCodes?: string[];
}
/**
 * Normalize an OpenAPI schema to our common format
 */
export declare function normalizeOpenApiSchema(schema: SchemaObject | undefined, components?: Record<string, SchemaObject>, visited?: Set<string>): NormalizedType;
/**
 * Normalize a TypeScript type to our common format
 */
export declare function normalizeTypeScriptType(type: ts.Type, checker: ts.TypeChecker, visited?: Set<ts.Type>): NormalizedType;
/**
 * Extract route handlers from TypeScript files
 * Supports: Express, Fastify, NestJS patterns
 */
export declare function extractHandlers(files: string[], cwd: string): ExtractedHandler[];
/**
 * Compare two normalized types and find differences
 */
export declare function compareTypes(expected: NormalizedType, actual: NormalizedType, path: string, options?: DifferOptions): SchemaDiff[];
/**
 * Convert normalized type to string for display
 */
export declare function typeToString(type: NormalizedType): string;
/**
 * Match handlers to spec endpoints
 * Uses multiple strategies: operationId, route path, function name
 */
export declare function matchHandlersToEndpoints(handlers: ExtractedHandler[], endpoints: SpecEndpoint[]): Map<ExtractedHandler, SpecEndpoint>;
/**
 * Find handler files in a directory
 */
export declare function findHandlerFiles(cwd: string, patterns?: string[]): string[];
/**
 * Run the response shape differ
 */
export declare function runDiffer(spec: ParsedSpec, cwd: string, options?: DifferOptions): DifferResult;
/**
 * Format differ result as a report
 */
export declare function formatDifferReport(result: DifferResult): string;
//# sourceMappingURL=response-differ.d.ts.map