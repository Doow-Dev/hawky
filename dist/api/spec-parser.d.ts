/**
 * OpenAPI Spec Parser
 *
 * Parses OpenAPI 3.0+ specification files (YAML/JSON) and extracts
 * endpoint information, schemas, and error codes for validation.
 */
/**
 * HTTP methods supported by OpenAPI
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';
/**
 * All valid HTTP methods
 */
export declare const HTTP_METHODS: HttpMethod[];
/**
 * Parameter location in OpenAPI
 */
export type ParameterLocation = 'query' | 'header' | 'path' | 'cookie';
/**
 * Parsed parameter from spec
 */
export interface SpecParameter {
    name: string;
    in: ParameterLocation;
    required: boolean;
    description?: string;
    schema?: SchemaObject;
}
/**
 * Parsed response from spec
 */
export interface SpecResponse {
    statusCode: string;
    description: string;
    schema?: SchemaObject;
    headers?: Record<string, SchemaObject>;
}
/**
 * Schema object (simplified)
 */
export interface SchemaObject {
    type?: string;
    format?: string;
    properties?: Record<string, SchemaObject>;
    items?: SchemaObject;
    required?: string[];
    $ref?: string;
    enum?: unknown[];
    description?: string;
}
/**
 * Parsed endpoint from spec
 */
export interface SpecEndpoint {
    path: string;
    method: HttpMethod;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters: SpecParameter[];
    requestBody?: {
        required: boolean;
        contentType: string;
        schema?: SchemaObject;
    };
    responses: SpecResponse[];
    security?: Array<Record<string, string[]>>;
    deprecated?: boolean;
}
/**
 * Error code extracted from spec
 */
export interface SpecErrorCode {
    statusCode: string;
    path: string;
    method: HttpMethod;
    description: string;
}
/**
 * Parsed OpenAPI specification
 */
export interface ParsedSpec {
    /** OpenAPI version */
    openApiVersion: string;
    /** API info */
    info: {
        title: string;
        version: string;
        description?: string;
    };
    /** Base servers */
    servers: Array<{
        url: string;
        description?: string;
    }>;
    /** All endpoints */
    endpoints: SpecEndpoint[];
    /** All error codes (4xx, 5xx responses) */
    errorCodes: SpecErrorCode[];
    /** All tags */
    tags: string[];
    /** Path to the spec file */
    specPath: string;
    /** Last modified time of spec file */
    lastModified: Date;
}
/**
 * Parse result
 */
export interface ParseResult {
    success: boolean;
    spec?: ParsedSpec;
    error?: string;
}
/**
 * Check if a file is an OpenAPI spec
 */
export declare function isOpenApiSpec(filePath: string): boolean;
/**
 * Find OpenAPI spec files in a directory
 */
export declare function findSpecFiles(dir: string): string[];
/**
 * Parse an OpenAPI 3.0+ specification file
 */
export declare function parseSpec(specPath: string): ParseResult;
/**
 * Get all unique status codes from a parsed spec
 */
export declare function getStatusCodes(spec: ParsedSpec): string[];
/**
 * Get all endpoints for a specific tag
 */
export declare function getEndpointsByTag(spec: ParsedSpec, tag: string): SpecEndpoint[];
/**
 * Get all error responses (4xx, 5xx) from spec
 */
export declare function getErrorResponses(spec: ParsedSpec): SpecErrorCode[];
//# sourceMappingURL=spec-parser.d.ts.map