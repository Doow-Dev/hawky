/**
 * Endpoint Test Generator
 *
 * Generates Jest test stubs from OpenAPI specifications.
 * Creates runnable test files with proper typing and structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedSpec, SpecEndpoint, SpecParameter, SchemaObject } from './spec-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for test generation
 */
export interface TestGeneratorOptions {
  /** Output directory for generated tests (default: __generated__/api-tests) */
  outputDir?: string;

  /** Base URL for API requests (default: 'http://localhost:3000') */
  baseUrl?: string;

  /** Import path for the API client/fetch function */
  clientImport?: string;

  /** Test framework (currently only 'jest' supported) */
  framework?: 'jest';

  /** Whether to generate a single file or split by tag */
  splitByTag?: boolean;

  /** Custom header for generated files */
  fileHeader?: string;

  /** Whether to overwrite existing files (default: false) */
  overwrite?: boolean;

  /** HTTP client to use in generated tests */
  httpClient?: 'fetch' | 'axios' | 'supertest';
}

/**
 * Generated test file
 */
export interface GeneratedTestFile {
  /** Relative path within output directory */
  path: string;

  /** File content */
  content: string;

  /** Endpoints covered */
  endpoints: number;
}

/**
 * Result of test generation
 */
export interface TestGeneratorResult {
  /** Generated files */
  files: GeneratedTestFile[];

  /** Total endpoints processed */
  totalEndpoints: number;

  /** Output directory path */
  outputDir: string;

  /** Whether files were written */
  written: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_OPTIONS: Required<TestGeneratorOptions> = {
  outputDir: '__generated__/api-tests',
  baseUrl: 'http://localhost:3000',
  clientImport: '',
  framework: 'jest',
  splitByTag: false,
  fileHeader: '',
  overwrite: false,
  httpClient: 'fetch',
};

// ============================================================================
// Code Generation Helpers
// ============================================================================

/**
 * Convert OpenAPI path params to variable interpolation
 * /users/{id} -> /users/${id}
 */
function convertPathParams(pathStr: string): string {
  return pathStr.replace(/\{(\w+)\}/g, '${$1}');
}

/**
 * Generate TypeScript type from OpenAPI schema
 * Useful for generating type definitions alongside tests
 */
export function schemaToTypeString(schema: SchemaObject | undefined, indent = 0): string {
  if (!schema) return 'unknown';

  const spaces = '  '.repeat(indent);

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/components/schemas/', '');
    return refName;
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum) {
        return schema.enum.map((v) => `'${v}'`).join(' | ');
      }
      return 'string';
    case 'number':
    case 'integer':
      if (schema.enum) {
        return schema.enum.map(String).join(' | ');
      }
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${schemaToTypeString(schema.items, indent)}[]`;
    case 'object':
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return 'Record<string, unknown>';
      }
      const required = new Set(schema.required || []);
      const props = Object.entries(schema.properties)
        .map(([key, prop]) => {
          const opt = required.has(key) ? '' : '?';
          return `${spaces}  ${key}${opt}: ${schemaToTypeString(prop, indent + 1)};`;
        })
        .join('\n');
      return `{\n${props}\n${spaces}}`;
    default:
      return 'unknown';
  }
}

/**
 * Generate a sample value for a schema
 */
function generateSampleValue(schema: SchemaObject | undefined, paramName?: string): string {
  if (!schema) return 'undefined';

  if (schema.$ref) {
    return '{}';
  }

  switch (schema.type) {
    case 'string':
      if (schema.enum && schema.enum.length > 0) {
        return `'${String(schema.enum[0])}'`;
      }
      if (schema.format === 'date-time') return `'2024-01-01T00:00:00Z'`;
      if (schema.format === 'date') return `'2024-01-01'`;
      if (schema.format === 'email') return `'test@example.com'`;
      if (schema.format === 'uuid') return `'00000000-0000-0000-0000-000000000000'`;
      if (paramName?.toLowerCase().includes('id')) return `'test-id'`;
      if (paramName?.toLowerCase().includes('name')) return `'Test Name'`;
      if (paramName?.toLowerCase().includes('email')) return `'test@example.com'`;
      return `'test-string'`;
    case 'number':
    case 'integer':
      if (schema.enum && schema.enum.length > 0) {
        return String(schema.enum[0]);
      }
      if (paramName?.toLowerCase().includes('id')) return '1';
      if (paramName?.toLowerCase().includes('page')) return '1';
      if (paramName?.toLowerCase().includes('limit')) return '10';
      return '0';
    case 'boolean':
      return 'true';
    case 'array':
      const itemSample = generateSampleValue(schema.items);
      return `[${itemSample}]`;
    case 'object':
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return '{}';
      }
      const props = Object.entries(schema.properties)
        .map(([key, prop]) => `${key}: ${generateSampleValue(prop, key)}`)
        .join(', ');
      return `{ ${props} }`;
    default:
      return 'undefined';
  }
}

/**
 * Generate param declarations
 */
function generateParamDeclarations(params: SpecParameter[]): string[] {
  return params.map((param) => {
    const value = generateSampleValue(param.schema, param.name);
    return `const ${param.name} = ${value};`;
  });
}

/**
 * Generate query string builder
 */
function generateQueryString(params: SpecParameter[]): string {
  const queryParams = params.filter((p) => p.in === 'query');
  if (queryParams.length === 0) return '';

  const parts = queryParams
    .map((p) => `${p.name}=\${encodeURIComponent(String(${p.name}))}`)
    .join('&');
  return `?${parts}`;
}

// ============================================================================
// Test Generation
// ============================================================================

/**
 * Generate test for a single endpoint
 */
function generateEndpointTest(
  endpoint: SpecEndpoint,
  options: Required<TestGeneratorOptions>
): string {
  const { method, path: pathStr, summary, parameters, requestBody, responses } = endpoint;

  const description = summary || `Test ${method.toUpperCase()} ${pathStr}`;

  // Separate params by type
  const pathParams = parameters.filter((p) => p.in === 'path');
  const queryParams = parameters.filter((p) => p.in === 'query');
  const headerParams = parameters.filter((p) => p.in === 'header');

  // Generate param declarations
  const paramDecls = generateParamDeclarations([...pathParams, ...queryParams]);

  // Build URL
  const urlPath = convertPathParams(pathStr);
  const queryString = generateQueryString(queryParams);
  const fullUrl = `\`${options.baseUrl}${urlPath}${queryString}\``;

  // Generate headers
  const headers: string[] = ["'Content-Type': 'application/json'"];
  for (const hp of headerParams) {
    headers.push(`'${hp.name}': ${generateSampleValue(hp.schema, hp.name)}`);
  }

  // Generate body for POST/PUT/PATCH
  let bodyCode = '';
  if (requestBody && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
    const sample = generateSampleValue(requestBody.schema);
    bodyCode = `const body = ${sample};`;
  }

  // Get success response schema
  const successResponse = responses.find((r) => r.statusCode.startsWith('2'));
  const expectedStatus = successResponse?.statusCode || '200';

  // Build fetch options
  const fetchOptions: string[] = [];
  fetchOptions.push(`method: '${method.toUpperCase()}'`);
  if (headers.length > 0) {
    fetchOptions.push(`headers: { ${headers.join(', ')} }`);
  }
  if (bodyCode) {
    fetchOptions.push(`body: JSON.stringify(body)`);
  }

  // Generate the test
  const lines: string[] = [];
  lines.push(`  it('${description.replace(/'/g, "\\'")}', async () => {`);

  // Param declarations
  if (paramDecls.length > 0) {
    lines.push(`    // Path/query parameters`);
    paramDecls.forEach((decl) => lines.push(`    ${decl}`));
    lines.push('');
  }

  // Body declaration
  if (bodyCode) {
    lines.push(`    // Request body`);
    lines.push(`    ${bodyCode}`);
    lines.push('');
  }

  // Fetch call
  lines.push(`    const response = await fetch(${fullUrl}, {`);
  fetchOptions.forEach((opt, i) => {
    const comma = i < fetchOptions.length - 1 ? ',' : '';
    lines.push(`      ${opt}${comma}`);
  });
  lines.push(`    });`);
  lines.push('');

  // Assertions
  lines.push(`    // Assert response status`);
  lines.push(`    expect(response.status).toBe(${expectedStatus});`);
  lines.push('');

  // Parse response
  if (successResponse?.schema) {
    lines.push(`    // Parse and validate response`);
    lines.push(`    const data = await response.json();`);
    lines.push(`    expect(data).toBeDefined();`);

    // Add property checks for object responses
    if (successResponse.schema.type === 'object' && successResponse.schema.properties) {
      const required = new Set(successResponse.schema.required || []);
      for (const [key] of Object.entries(successResponse.schema.properties)) {
        if (required.has(key)) {
          lines.push(`    expect(data).toHaveProperty('${key}');`);
        }
      }
    }
  }

  lines.push(`  });`);

  return lines.join('\n');
}

/**
 * Generate imports for test file
 */
function generateImports(options: Required<TestGeneratorOptions>): string[] {
  const imports: string[] = [];

  if (options.clientImport) {
    imports.push(options.clientImport);
  }

  // fetch is globally available in Node 18+
  // No import needed for native fetch

  return imports;
}

/**
 * Generate a complete test file
 */
function generateTestFile(
  endpoints: SpecEndpoint[],
  tag: string | null,
  spec: ParsedSpec,
  options: Required<TestGeneratorOptions>
): string {
  const lines: string[] = [];

  // File header
  lines.push('/**');
  lines.push(` * Auto-generated API tests from OpenAPI spec`);
  lines.push(` * Spec: ${spec.info.title} v${spec.info.version}`);
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' *');
  lines.push(' * DO NOT EDIT - This file is auto-generated.');
  lines.push(' * Re-run test generator to update.');
  lines.push(' */');
  lines.push('');

  // Custom header
  if (options.fileHeader) {
    lines.push(options.fileHeader);
    lines.push('');
  }

  // Imports
  const imports = generateImports(options);
  if (imports.length > 0) {
    imports.forEach((imp) => lines.push(imp));
    lines.push('');
  }

  // Base URL constant
  lines.push(`const BASE_URL = '${options.baseUrl}';`);
  lines.push('');

  // Describe block
  const describeName = tag ? `API: ${tag}` : `API: ${spec.info.title}`;
  lines.push(`describe('${describeName.replace(/'/g, "\\'")}', () => {`);

  // Generate tests for each endpoint
  for (const endpoint of endpoints) {
    lines.push('');
    lines.push(generateEndpointTest(endpoint, options));
  }

  lines.push('');
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate test files from OpenAPI spec
 */
export function generateTests(
  spec: ParsedSpec,
  options: TestGeneratorOptions = {}
): TestGeneratorResult {
  const opts: Required<TestGeneratorOptions> = { ...DEFAULT_OPTIONS, ...options };

  const files: GeneratedTestFile[] = [];

  if (opts.splitByTag) {
    // Group endpoints by tag
    const byTag = new Map<string, SpecEndpoint[]>();

    for (const endpoint of spec.endpoints) {
      const tag = endpoint.tags?.[0] || 'default';
      const arr = byTag.get(tag) || [];
      arr.push(endpoint);
      byTag.set(tag, arr);
    }

    // Generate file per tag
    for (const [tag, endpoints] of byTag.entries()) {
      const content = generateTestFile(endpoints, tag, spec, opts);
      const fileName = `${tag.toLowerCase().replace(/[^a-z0-9]/g, '-')}.test.ts`;

      files.push({
        path: fileName,
        content,
        endpoints: endpoints.length,
      });
    }
  } else {
    // Single file for all endpoints
    const content = generateTestFile(spec.endpoints, null, spec, opts);

    files.push({
      path: 'api.test.ts',
      content,
      endpoints: spec.endpoints.length,
    });
  }

  return {
    files,
    totalEndpoints: spec.endpoints.length,
    outputDir: opts.outputDir,
    written: false,
  };
}

/**
 * Generate and write test files to disk
 */
export function generateAndWriteTests(
  spec: ParsedSpec,
  cwd: string,
  options: TestGeneratorOptions = {}
): TestGeneratorResult {
  const result = generateTests(spec, options);
  const opts: Required<TestGeneratorOptions> = { ...DEFAULT_OPTIONS, ...options };

  const outputDir = path.join(cwd, opts.outputDir);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Write files
  for (const file of result.files) {
    const filePath = path.join(outputDir, file.path);

    // Check if file exists
    if (fs.existsSync(filePath) && !opts.overwrite) {
      // Skip existing files unless overwrite is true
      continue;
    }

    fs.writeFileSync(filePath, file.content, 'utf8');
  }

  return { ...result, written: true };
}

/**
 * Format test generation result as a report
 */
export function formatTestGeneratorReport(result: TestGeneratorResult): string {
  const lines: string[] = [];

  lines.push('# API Test Generation Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total endpoints: ${result.totalEndpoints}`);
  lines.push(`- Files generated: ${result.files.length}`);
  lines.push(`- Output directory: ${result.outputDir}`);
  lines.push(`- Written to disk: ${result.written ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('## Generated Files');
  lines.push('');

  for (const file of result.files) {
    lines.push(`### ${file.path}`);
    lines.push(`- Endpoints: ${file.endpoints}`);
    lines.push('');
  }

  return lines.join('\n');
}
