/**
 * Test Generator Tests
 *
 * Tests for generating Jest test stubs from OpenAPI specifications.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateTests,
  generateAndWriteTests,
  formatTestGeneratorReport,
  schemaToTypeString,
  type TestGeneratorOptions,
} from '../../src/api/test-generator';
import type { ParsedSpec, SpecEndpoint, SchemaObject } from '../../src/api/spec-parser';

// Test fixtures
const createMockSpec = (endpoints: SpecEndpoint[] = []): ParsedSpec => ({
  openApiVersion: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000' }],
  endpoints,
  errorCodes: [],
  tags: ['default'],
  specPath: 'openapi.yaml',
  lastModified: new Date(),
});

const createMockEndpoint = (overrides: Partial<SpecEndpoint> = {}): SpecEndpoint => ({
  path: '/users',
  method: 'get',
  operationId: 'getUsers',
  summary: 'Get all users',
  parameters: [],
  responses: [
    {
      statusCode: '200',
      description: 'Success',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      },
    },
  ],
  ...overrides,
});

describe('schemaToTypeString', () => {
  it('converts primitive types', () => {
    expect(schemaToTypeString({ type: 'string' })).toBe('string');
    expect(schemaToTypeString({ type: 'number' })).toBe('number');
    expect(schemaToTypeString({ type: 'integer' })).toBe('number');
    expect(schemaToTypeString({ type: 'boolean' })).toBe('boolean');
  });

  it('converts string enums', () => {
    const schema: SchemaObject = { type: 'string', enum: ['active', 'inactive'] };
    expect(schemaToTypeString(schema)).toBe("'active' | 'inactive'");
  });

  it('converts number enums', () => {
    const schema: SchemaObject = { type: 'number', enum: [1, 2, 3] };
    expect(schemaToTypeString(schema)).toBe('1 | 2 | 3');
  });

  it('converts arrays', () => {
    const schema: SchemaObject = { type: 'array', items: { type: 'string' } };
    expect(schemaToTypeString(schema)).toBe('string[]');
  });

  it('converts nested arrays', () => {
    const schema: SchemaObject = {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    };
    expect(schemaToTypeString(schema)).toBe('number[][]');
  });

  it('converts simple objects', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
      required: ['id'],
    };
    const result = schemaToTypeString(schema);
    expect(result).toContain('id: number');
    expect(result).toContain('name?: string');
  });

  it('handles $ref', () => {
    const schema: SchemaObject = { $ref: '#/components/schemas/User' };
    expect(schemaToTypeString(schema)).toBe('User');
  });

  it('handles empty object', () => {
    const schema: SchemaObject = { type: 'object' };
    expect(schemaToTypeString(schema)).toBe('Record<string, unknown>');
  });

  it('handles undefined schema', () => {
    expect(schemaToTypeString(undefined)).toBe('unknown');
  });
});

describe('generateTests', () => {
  it('generates tests for empty spec', () => {
    const spec = createMockSpec([]);
    const result = generateTests(spec);

    expect(result.files).toHaveLength(1);
    expect(result.totalEndpoints).toBe(0);
    expect(result.written).toBe(false);
  });

  it('generates tests for single endpoint', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const result = generateTests(spec);

    expect(result.files).toHaveLength(1);
    expect(result.totalEndpoints).toBe(1);
    expect(result.files[0]?.path).toBe('api.test.ts');

    const content = result.files[0]?.content || '';
    expect(content).toContain("describe('API: Test API'");
    expect(content).toContain("it('Get all users'");
    expect(content).toContain("method: 'GET'");
    expect(content).toContain('/users');
  });

  it('generates tests with path parameters', () => {
    const endpoint = createMockEndpoint({
      path: '/users/{id}',
      method: 'get',
      operationId: 'getUser',
      summary: 'Get user by ID',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
    });
    const spec = createMockSpec([endpoint]);
    const result = generateTests(spec);

    const content = result.files[0]?.content || '';
    expect(content).toContain('const id =');
    expect(content).toContain('${id}');
  });

  it('generates tests with query parameters', () => {
    const endpoint = createMockEndpoint({
      parameters: [
        { name: 'page', in: 'query', required: false, schema: { type: 'number' } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'number' } },
      ],
    });
    const spec = createMockSpec([endpoint]);
    const result = generateTests(spec);

    const content = result.files[0]?.content || '';
    expect(content).toContain('const page =');
    expect(content).toContain('const limit =');
    expect(content).toContain('page=');
    expect(content).toContain('limit=');
  });

  it('generates tests with request body', () => {
    const endpoint = createMockEndpoint({
      method: 'post',
      summary: 'Create user',
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    });
    const spec = createMockSpec([endpoint]);
    const result = generateTests(spec);

    const content = result.files[0]?.content || '';
    expect(content).toContain("method: 'POST'");
    expect(content).toContain('const body =');
    expect(content).toContain('JSON.stringify(body)');
  });

  it('generates response assertions', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const result = generateTests(spec);

    const content = result.files[0]?.content || '';
    expect(content).toContain('expect(response.status).toBe(200)');
    expect(content).toContain('expect(data).toBeDefined()');
  });

  it('respects custom base URL', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const result = generateTests(spec, { baseUrl: 'https://api.example.com' });

    const content = result.files[0]?.content || '';
    expect(content).toContain("BASE_URL = 'https://api.example.com'");
  });

  it('splits files by tag when enabled', () => {
    const endpoints = [
      createMockEndpoint({ tags: ['users'] }),
      createMockEndpoint({ path: '/posts', method: 'get', tags: ['posts'] }),
    ];
    const spec = createMockSpec(endpoints);
    const result = generateTests(spec, { splitByTag: true });

    expect(result.files).toHaveLength(2);
    expect(result.files.some((f) => f.path.includes('users'))).toBe(true);
    expect(result.files.some((f) => f.path.includes('posts'))).toBe(true);
  });

  it('handles endpoint without tags', () => {
    const endpoint = createMockEndpoint({ tags: undefined });
    const spec = createMockSpec([endpoint]);
    const result = generateTests(spec, { splitByTag: true });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toContain('default');
  });

  it('includes custom file header', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const result = generateTests(spec, { fileHeader: '// Custom header' });

    const content = result.files[0]?.content || '';
    expect(content).toContain('// Custom header');
  });

  it('generates proper auto-generated header', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const result = generateTests(spec);

    const content = result.files[0]?.content || '';
    expect(content).toContain('Auto-generated API tests');
    expect(content).toContain('DO NOT EDIT');
    expect(content).toContain('Test API v1.0.0');
  });
});

describe('generateAndWriteTests', () => {
  const outputDir = path.join(__dirname, '../fixtures/generated-tests');

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('writes test files to disk', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const cwd = path.dirname(outputDir);
    const result = generateAndWriteTests(spec, cwd, {
      outputDir: 'generated-tests',
    });

    expect(result.written).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'api.test.ts'))).toBe(true);
  });

  it('does not overwrite by default', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const cwd = path.dirname(outputDir);

    // First write
    generateAndWriteTests(spec, cwd, { outputDir: 'generated-tests' });

    // Get initial content
    const initialContent = fs.readFileSync(path.join(outputDir, 'api.test.ts'), 'utf8');

    // Modify the spec
    const newSpec = createMockSpec([
      createMockEndpoint({ summary: 'New summary' }),
    ]);

    // Second write without overwrite
    generateAndWriteTests(newSpec, cwd, { outputDir: 'generated-tests' });

    // Content should be unchanged
    const finalContent = fs.readFileSync(path.join(outputDir, 'api.test.ts'), 'utf8');
    expect(finalContent).toBe(initialContent);
  });

  it('overwrites when flag is set', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const cwd = path.dirname(outputDir);

    // First write
    generateAndWriteTests(spec, cwd, { outputDir: 'generated-tests' });

    // Get initial content
    const initialContent = fs.readFileSync(path.join(outputDir, 'api.test.ts'), 'utf8');

    // Modify the spec
    const newSpec = createMockSpec([
      createMockEndpoint({ summary: 'New summary' }),
    ]);

    // Second write WITH overwrite
    generateAndWriteTests(newSpec, cwd, { outputDir: 'generated-tests', overwrite: true });

    // Content should be different
    const finalContent = fs.readFileSync(path.join(outputDir, 'api.test.ts'), 'utf8');
    expect(finalContent).not.toBe(initialContent);
    expect(finalContent).toContain('New summary');
  });

  it('creates output directory if it does not exist', () => {
    const spec = createMockSpec([createMockEndpoint()]);
    const cwd = path.dirname(outputDir);
    const nestedDir = 'generated-tests/nested/deep';

    generateAndWriteTests(spec, cwd, { outputDir: nestedDir });

    expect(fs.existsSync(path.join(cwd, nestedDir))).toBe(true);

    // Cleanup nested
    fs.rmSync(path.join(cwd, 'generated-tests'), { recursive: true });
  });
});

describe('formatTestGeneratorReport', () => {
  it('formats report correctly', () => {
    const result = {
      files: [
        { path: 'api.test.ts', content: '', endpoints: 5 },
        { path: 'users.test.ts', content: '', endpoints: 3 },
      ],
      totalEndpoints: 8,
      outputDir: '__generated__/api-tests',
      written: true,
    };

    const report = formatTestGeneratorReport(result);

    expect(report).toContain('# API Test Generation Report');
    expect(report).toContain('Total endpoints: 8');
    expect(report).toContain('Files generated: 2');
    expect(report).toContain('api.test.ts');
    expect(report).toContain('users.test.ts');
    expect(report).toContain('Written to disk: Yes');
  });

  it('shows not written when applicable', () => {
    const result = {
      files: [],
      totalEndpoints: 0,
      outputDir: '__generated__/api-tests',
      written: false,
    };

    const report = formatTestGeneratorReport(result);
    expect(report).toContain('Written to disk: No');
  });
});
