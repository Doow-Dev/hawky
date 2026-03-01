/**
 * OpenAPI Spec Parser
 *
 * Parses OpenAPI 3.0+ specification files (YAML/JSON) and extracts
 * endpoint information, schemas, and error codes for validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * HTTP methods supported by OpenAPI
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';

/**
 * All valid HTTP methods
 */
export const HTTP_METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
];

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
 * Raw OpenAPI document structure
 */
interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths?: Record<string, PathItemObject>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    responses?: Record<string, ResponseObject>;
    parameters?: Record<string, ParameterObject>;
    securitySchemes?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
}

interface PathItemObject {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  head?: OperationObject;
  options?: OperationObject;
  trace?: OperationObject;
  parameters?: ParameterObject[];
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

interface ParameterObject {
  name: string;
  in: ParameterLocation;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  $ref?: string;
}

interface RequestBodyObject {
  required?: boolean;
  description?: string;
  content?: Record<
    string,
    {
      schema?: SchemaObject;
    }
  >;
}

interface ResponseObject {
  description?: string;
  content?: Record<
    string,
    {
      schema?: SchemaObject;
    }
  >;
  headers?: Record<string, { schema?: SchemaObject }>;
  $ref?: string;
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
export function isOpenApiSpec(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.yaml', '.yml', '.json'].includes(ext)) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = ext === '.json' ? JSON.parse(content) : yaml.parse(content);

    return typeof doc?.openapi === 'string' && doc.openapi.startsWith('3.');
  } catch {
    return false;
  }
}

/**
 * Find OpenAPI spec files in a directory
 */
export function findSpecFiles(dir: string): string[] {
  const specFiles: string[] = [];

  // Common spec file locations
  const commonPaths = [
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'api.yaml',
    'api.yml',
    'api.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
    'spec/openapi.yaml',
    'spec/openapi.yml',
    'spec/openapi.json',
    'api/openapi.yaml',
    'api/openapi.yml',
    'api/openapi.json',
    'docs/openapi.yaml',
    'docs/openapi.yml',
    'docs/openapi.json',
  ];

  for (const relativePath of commonPaths) {
    const fullPath = path.join(dir, relativePath);
    if (fs.existsSync(fullPath) && isOpenApiSpec(fullPath)) {
      specFiles.push(fullPath);
    }
  }

  return specFiles;
}

/**
 * Parse an OpenAPI 3.0+ specification file
 */
export function parseSpec(specPath: string): ParseResult {
  try {
    // Check file exists
    if (!fs.existsSync(specPath)) {
      return { success: false, error: `Spec file not found: ${specPath}` };
    }

    // Read and parse file
    const content = fs.readFileSync(specPath, 'utf8');
    const ext = path.extname(specPath).toLowerCase();
    const doc: OpenApiDocument = ext === '.json' ? JSON.parse(content) : yaml.parse(content);

    // Validate OpenAPI version
    if (!doc.openapi || !doc.openapi.startsWith('3.')) {
      return {
        success: false,
        error: `Unsupported OpenAPI version: ${doc.openapi || 'unknown'}. Only 3.x is supported.`,
      };
    }

    // Get file stats
    const stats = fs.statSync(specPath);

    // Extract endpoints
    const endpoints: SpecEndpoint[] = [];
    const errorCodes: SpecErrorCode[] = [];
    const allTags = new Set<string>();

    if (doc.paths) {
      for (const [pathStr, pathItem] of Object.entries(doc.paths)) {
        // Get path-level parameters
        const pathParams = pathItem.parameters || [];

        for (const method of HTTP_METHODS) {
          const operation = pathItem[method];
          if (!operation) continue;

          // Collect tags
          if (operation.tags) {
            operation.tags.forEach((tag) => allTags.add(tag));
          }

          // Merge path and operation parameters
          const parameters: SpecParameter[] = [
            ...parseParameters(pathParams, doc.components?.parameters),
            ...parseParameters(operation.parameters || [], doc.components?.parameters),
          ];

          // Parse request body
          let requestBody: SpecEndpoint['requestBody'] | undefined;
          if (operation.requestBody) {
            const rb = operation.requestBody;
            const contentType = Object.keys(rb.content || {})[0] || 'application/json';
            const schema = rb.content?.[contentType]?.schema;
            requestBody = {
              required: rb.required || false,
              contentType,
              ...(schema && { schema }),
            };
          }

          // Parse responses
          const responses: SpecResponse[] = [];
          if (operation.responses) {
            for (const [statusCode, response] of Object.entries(operation.responses)) {
              const resolved = resolveResponse(response, doc.components?.responses);
              const responseSchema = Object.values(resolved.content || {})[0]?.schema;
              const responseHeaders = resolved.headers
                ? Object.fromEntries(
                    Object.entries(resolved.headers).map(([k, v]) => [k, v.schema || {}])
                  )
                : undefined;
              responses.push({
                statusCode,
                description: resolved.description || '',
                ...(responseSchema && { schema: responseSchema }),
                ...(responseHeaders && { headers: responseHeaders }),
              });

              // Track error codes (4xx, 5xx)
              if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
                errorCodes.push({
                  statusCode,
                  path: pathStr,
                  method,
                  description: resolved.description || '',
                });
              }
            }
          }

          endpoints.push({
            path: pathStr,
            method,
            ...(operation.operationId && { operationId: operation.operationId }),
            ...(operation.summary && { summary: operation.summary }),
            ...(operation.description && { description: operation.description }),
            ...(operation.tags && { tags: operation.tags }),
            parameters,
            ...(requestBody && { requestBody }),
            responses,
            ...(operation.security && { security: operation.security }),
            ...(operation.deprecated && { deprecated: operation.deprecated }),
          });
        }
      }
    }

    // Add tags from top-level tags array
    if (doc.tags) {
      doc.tags.forEach((tag) => allTags.add(tag.name));
    }

    const infoDescription = doc.info?.description;
    const parsedSpec: ParsedSpec = {
      openApiVersion: doc.openapi,
      info: {
        title: doc.info?.title || 'Unknown',
        version: doc.info?.version || '0.0.0',
        ...(infoDescription && { description: infoDescription }),
      },
      servers: doc.servers || [],
      endpoints,
      errorCodes,
      tags: Array.from(allTags).sort(),
      specPath,
      lastModified: stats.mtime,
    };

    return { success: true, spec: parsedSpec };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to parse spec: ${message}` };
  }
}

/**
 * Parse parameter array, resolving $refs
 */
function parseParameters(
  params: ParameterObject[],
  componentParams?: Record<string, ParameterObject>
): SpecParameter[] {
  return params.map((param) => {
    // Resolve $ref if present
    if (param.$ref && componentParams) {
      const refName = param.$ref.replace('#/components/parameters/', '');
      const resolved = componentParams[refName];
      if (resolved) {
        param = resolved;
      }
    }

    return {
      name: param.name,
      in: param.in,
      required: param.required || false,
      ...(param.description && { description: param.description }),
      ...(param.schema && { schema: param.schema }),
    };
  });
}

/**
 * Resolve response reference
 */
function resolveResponse(
  response: ResponseObject,
  componentResponses?: Record<string, ResponseObject>
): ResponseObject {
  if (response.$ref && componentResponses) {
    const refName = response.$ref.replace('#/components/responses/', '');
    const resolved = componentResponses[refName];
    if (resolved) {
      return resolved;
    }
  }
  return response;
}

/**
 * Get all unique status codes from a parsed spec
 */
export function getStatusCodes(spec: ParsedSpec): string[] {
  const codes = new Set<string>();
  for (const endpoint of spec.endpoints) {
    for (const response of endpoint.responses) {
      codes.add(response.statusCode);
    }
  }
  return Array.from(codes).sort();
}

/**
 * Get all endpoints for a specific tag
 */
export function getEndpointsByTag(spec: ParsedSpec, tag: string): SpecEndpoint[] {
  return spec.endpoints.filter((e) => e.tags?.includes(tag));
}

/**
 * Get all error responses (4xx, 5xx) from spec
 */
export function getErrorResponses(spec: ParsedSpec): SpecErrorCode[] {
  return spec.errorCodes;
}
