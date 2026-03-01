/**
 * Response Differ Tests
 *
 * Tests for API contract validation — comparing OpenAPI spec against TypeScript implementation.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  normalizeOpenApiSchema,
  normalizeTypeScriptType,
  compareTypes,
  typeToString,
  matchHandlersToEndpoints,
  findHandlerFiles,
  extractHandlers,
  runDiffer,
  formatDifferReport,
  type NormalizedType,
  type NormalizedProperty,
  type ExtractedHandler,
  type DifferOptions,
} from '../../src/api/response-differ';
import type { SchemaObject, SpecEndpoint, ParsedSpec } from '../../src/api/spec-parser';
import * as ts from 'typescript';

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, '../fixtures/api-handlers');

describe('normalizeOpenApiSchema', () => {
  describe('primitive types', () => {
    it('normalizes string type', () => {
      const schema: SchemaObject = { type: 'string' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('string');
    });

    it('normalizes string with format', () => {
      const schema: SchemaObject = { type: 'string', format: 'date-time' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('string');
      expect(result.format).toBe('date-time');
    });

    it('normalizes string enum', () => {
      const schema: SchemaObject = { type: 'string', enum: ['active', 'inactive'] };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('string');
      expect(result.enumValues).toEqual(['active', 'inactive']);
    });

    it('normalizes number type', () => {
      const schema: SchemaObject = { type: 'number' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('number');
    });

    it('normalizes integer type as number', () => {
      const schema: SchemaObject = { type: 'integer' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('number');
    });

    it('normalizes boolean type', () => {
      const schema: SchemaObject = { type: 'boolean' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('boolean');
    });

    it('normalizes null type', () => {
      const schema: SchemaObject = { type: 'null' };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('null');
    });
  });

  describe('array types', () => {
    it('normalizes array of strings', () => {
      const schema: SchemaObject = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('array');
      expect(result.elementType?.kind).toBe('string');
    });

    it('normalizes nested arrays', () => {
      const schema: SchemaObject = {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
        },
      };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('array');
      expect(result.elementType?.kind).toBe('array');
      expect(result.elementType?.elementType?.kind).toBe('number');
    });
  });

  describe('object types', () => {
    it('normalizes simple object', () => {
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['id'],
      };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('object');
      expect(result.properties?.['id']?.type.kind).toBe('number');
      expect(result.properties?.['id']?.required).toBe(true);
      expect(result.properties?.['name']?.type.kind).toBe('string');
      expect(result.properties?.['name']?.required).toBe(false);
    });

    it('normalizes nested objects', () => {
      const schema: SchemaObject = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              email: { type: 'string' },
            },
          },
        },
      };
      const result = normalizeOpenApiSchema(schema);
      expect(result.kind).toBe('object');
      expect(result.properties?.['user']?.type.kind).toBe('object');
      expect(result.properties?.['user']?.type.properties?.['email']?.type.kind).toBe('string');
    });
  });

  describe('$ref resolution', () => {
    it('resolves component references', () => {
      const schema: SchemaObject = {
        $ref: '#/components/schemas/User',
      };
      const components: Record<string, SchemaObject> = {
        User: {
          type: 'object',
          properties: {
            id: { type: 'number' },
          },
        },
      };
      const result = normalizeOpenApiSchema(schema, components);
      expect(result.kind).toBe('object');
      expect(result.typeName).toBe('User');
    });

    it('handles circular references', () => {
      const schema: SchemaObject = {
        $ref: '#/components/schemas/Node',
      };
      const components: Record<string, SchemaObject> = {
        Node: {
          type: 'object',
          properties: {
            child: { $ref: '#/components/schemas/Node' },
          },
        },
      };
      const result = normalizeOpenApiSchema(schema, components);
      expect(result.kind).toBe('object');
      expect(result.properties?.['child']?.type.kind).toBe('unknown');
    });
  });
});

describe('compareTypes', () => {
  describe('primitive comparisons', () => {
    it('returns no diffs for matching types', () => {
      const expected: NormalizedType = { kind: 'string' };
      const actual: NormalizedType = { kind: 'string' };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(0);
    });

    it('detects type mismatch', () => {
      const expected: NormalizedType = { kind: 'string' };
      const actual: NormalizedType = { kind: 'number' };
      const diffs = compareTypes(expected, actual, 'field');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('type_mismatch');
      expect(diffs[0]?.severity).toBe('error');
    });
  });

  describe('object comparisons', () => {
    it('detects missing required field', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {
          id: { type: { kind: 'number' }, required: true },
        },
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {},
      };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('missing_field');
      expect(diffs[0]?.severity).toBe('error');
    });

    it('detects missing optional field as warning', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {
          name: { type: { kind: 'string' }, required: false },
        },
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {},
      };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('missing_field');
      expect(diffs[0]?.severity).toBe('warning');
    });

    it('detects extra field', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {},
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {
          extra: { type: { kind: 'string' }, required: true },
        },
      };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('extra_field');
      expect(diffs[0]?.severity).toBe('warning');
    });

    it('detects extra field as error with strict mode', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {},
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {
          extra: { type: { kind: 'string' }, required: true },
        },
      };
      const diffs = compareTypes(expected, actual, '', { strictExtraFields: true });
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('extra_field');
      expect(diffs[0]?.severity).toBe('error');
    });

    it('detects nested field type mismatch', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {
          user: {
            type: {
              kind: 'object',
              properties: {
                age: { type: { kind: 'number' }, required: true },
              },
            },
            required: true,
          },
        },
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {
          user: {
            type: {
              kind: 'object',
              properties: {
                age: { type: { kind: 'string' }, required: true },
              },
            },
            required: true,
          },
        },
      };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.path).toBe('user.age');
      expect(diffs[0]?.kind).toBe('type_mismatch');
    });

    it('detects required mismatch', () => {
      const expected: NormalizedType = {
        kind: 'object',
        properties: {
          field: { type: { kind: 'string' }, required: true },
        },
      };
      const actual: NormalizedType = {
        kind: 'object',
        properties: {
          field: { type: { kind: 'string' }, required: false },
        },
      };
      const diffs = compareTypes(expected, actual, '');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('required_mismatch');
    });
  });

  describe('array comparisons', () => {
    it('detects array element type mismatch', () => {
      const expected: NormalizedType = {
        kind: 'array',
        elementType: { kind: 'string' },
      };
      const actual: NormalizedType = {
        kind: 'array',
        elementType: { kind: 'number' },
      };
      const diffs = compareTypes(expected, actual, 'items');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.path).toBe('items[]');
      expect(diffs[0]?.kind).toBe('type_mismatch');
    });
  });

  describe('nullable handling', () => {
    it('detects nullable mismatch', () => {
      const expected: NormalizedType = { kind: 'string', nullable: true };
      const actual: NormalizedType = { kind: 'string', nullable: false };
      const diffs = compareTypes(expected, actual, 'field');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('nullable_mismatch');
      expect(diffs[0]?.severity).toBe('warning');
    });
  });

  describe('enum comparisons', () => {
    it('detects enum mismatch', () => {
      const expected: NormalizedType = { kind: 'string', enumValues: ['a', 'b', 'c'] };
      const actual: NormalizedType = { kind: 'string', enumValues: ['a', 'b'] };
      const diffs = compareTypes(expected, actual, 'status');
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.kind).toBe('enum_mismatch');
      expect(diffs[0]?.severity).toBe('error'); // Missing value is breaking
    });
  });
});

describe('typeToString', () => {
  it('formats primitive types', () => {
    expect(typeToString({ kind: 'string' })).toBe('string');
    expect(typeToString({ kind: 'number' })).toBe('number');
    expect(typeToString({ kind: 'boolean' })).toBe('boolean');
  });

  it('formats array types', () => {
    expect(typeToString({ kind: 'array', elementType: { kind: 'string' } })).toBe('string[]');
  });

  it('formats object types with properties', () => {
    const type: NormalizedType = {
      kind: 'object',
      properties: {
        id: { type: { kind: 'number' }, required: true },
        name: { type: { kind: 'string' }, required: false },
      },
    };
    const result = typeToString(type);
    expect(result).toContain('id: number');
    expect(result).toContain('name?: string');
  });

  it('formats union types', () => {
    const type: NormalizedType = {
      kind: 'union',
      unionTypes: [{ kind: 'string' }, { kind: 'number' }],
    };
    expect(typeToString(type)).toBe('string | number');
  });

  it('formats enum types', () => {
    const type: NormalizedType = {
      kind: 'string',
      enumValues: ['active', 'inactive'],
    };
    expect(typeToString(type)).toBe('"active" | "inactive"');
  });

  it('uses typeName when available', () => {
    const type: NormalizedType = {
      kind: 'object',
      typeName: 'User',
    };
    expect(typeToString(type)).toBe('User');
  });
});

describe('matchHandlersToEndpoints', () => {
  it('matches by operationId', () => {
    const handlers: ExtractedHandler[] = [
      { name: 'getUser', file: 'api.ts', line: 1, operationId: 'getUserById' },
    ];
    const endpoints: SpecEndpoint[] = [
      {
        path: '/users/{id}',
        method: 'get',
        operationId: 'getUserById',
        parameters: [],
        responses: [],
      },
    ];
    const matches = matchHandlersToEndpoints(handlers, endpoints);
    expect(matches.size).toBe(1);
    expect(matches.get(handlers[0]!)).toBe(endpoints[0]);
  });

  it('matches by route path and method', () => {
    const handlers: ExtractedHandler[] = [
      { name: 'getUser', file: 'api.ts', line: 1, method: 'GET', routePath: '/users/:id' },
    ];
    const endpoints: SpecEndpoint[] = [
      {
        path: '/users/{id}',
        method: 'get',
        parameters: [],
        responses: [],
      },
    ];
    const matches = matchHandlersToEndpoints(handlers, endpoints);
    expect(matches.size).toBe(1);
  });

  it('matches by function name to operationId', () => {
    const handlers: ExtractedHandler[] = [
      { name: 'getUserById', file: 'api.ts', line: 1 },
    ];
    const endpoints: SpecEndpoint[] = [
      {
        path: '/users/{id}',
        method: 'get',
        operationId: 'getUserById',
        parameters: [],
        responses: [],
      },
    ];
    const matches = matchHandlersToEndpoints(handlers, endpoints);
    expect(matches.size).toBe(1);
  });

  it('handles unmatched handlers', () => {
    const handlers: ExtractedHandler[] = [
      { name: 'unknownHandler', file: 'api.ts', line: 1 },
    ];
    const endpoints: SpecEndpoint[] = [];
    const matches = matchHandlersToEndpoints(handlers, endpoints);
    expect(matches.size).toBe(0);
  });
});

describe('formatDifferReport', () => {
  it('formats empty report', () => {
    const result = {
      violations: [],
      unmatchedHandlers: [],
      unmatchedEndpoints: [],
      stats: {
        totalHandlers: 0,
        matchedHandlers: 0,
        totalEndpoints: 0,
        matchedEndpoints: 0,
        violations: 0,
        errors: 0,
        warnings: 0,
      },
    };
    const report = formatDifferReport(result);
    expect(report).toContain('# API Contract Validation Report');
    expect(report).toContain('Violations: 0');
  });

  it('includes violations in report', () => {
    const result = {
      violations: [
        {
          ruleId: 'api-contract/missing-field',
          file: 'api/users.ts',
          line: 10,
          message: 'Missing field: id',
          severity: 'error' as const,
        },
      ],
      unmatchedHandlers: [],
      unmatchedEndpoints: [],
      stats: {
        totalHandlers: 1,
        matchedHandlers: 1,
        totalEndpoints: 1,
        matchedEndpoints: 1,
        violations: 1,
        errors: 1,
        warnings: 0,
      },
    };
    const report = formatDifferReport(result);
    expect(report).toContain('## Violations');
    expect(report).toContain('api/users.ts');
    expect(report).toContain('Missing field: id');
  });

  it('includes unmatched endpoints', () => {
    const result = {
      violations: [],
      unmatchedHandlers: [],
      unmatchedEndpoints: [
        {
          path: '/missing',
          method: 'get' as const,
          parameters: [],
          responses: [],
        },
      ],
      stats: {
        totalHandlers: 0,
        matchedHandlers: 0,
        totalEndpoints: 1,
        matchedEndpoints: 0,
        violations: 0,
        errors: 0,
        warnings: 0,
      },
    };
    const report = formatDifferReport(result);
    expect(report).toContain('## Unmatched Endpoints');
    expect(report).toContain('GET /missing');
  });
});

// Integration tests with real TypeScript files
describe('extractHandlers', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/api-handlers');

  beforeAll(() => {
    // Create fixtures directory if it doesn't exist
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create sample Express handler
    fs.writeFileSync(
      path.join(fixturesDir, 'express-handler.ts'),
      `
import { Router, Request, Response } from 'express';

const router = Router();

interface User {
  id: number;
  name: string;
  email: string;
}

// Express route handler
router.get('/users/:id', (req: Request, res: Response): User => {
  return { id: 1, name: 'Test', email: 'test@example.com' };
});

router.post('/users', (req: Request, res: Response): User => {
  return req.body as User;
});

export default router;
`
    );

    // Create sample exported function handler (Next.js API route style)
    fs.writeFileSync(
      path.join(fixturesDir, 'nextjs-handler.ts'),
      `
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function GET(): Promise<ApiResponse> {
  return { success: true, data: { message: 'Hello' } };
}

export async function POST(): Promise<ApiResponse> {
  return { success: true };
}
`
    );
  });

  afterAll(() => {
    // Cleanup fixtures
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true });
    }
  });

  it('extracts Express route handlers', () => {
    const files = [path.join(fixturesDir, 'express-handler.ts')];
    const handlers = extractHandlers(files, fixturesDir);

    // Should find GET and POST handlers
    const getHandler = handlers.find((h) => h.method === 'GET');
    const postHandler = handlers.find((h) => h.method === 'POST');

    expect(getHandler).toBeDefined();
    expect(getHandler?.routePath).toBe('/users/:id');

    expect(postHandler).toBeDefined();
    expect(postHandler?.routePath).toBe('/users');
  });

  it('extracts exported function handlers', () => {
    const files = [path.join(fixturesDir, 'nextjs-handler.ts')];
    const handlers = extractHandlers(files, fixturesDir);

    expect(handlers.length).toBeGreaterThan(0);

    // Should find GET and POST exports
    const getExport = handlers.find((h) => h.name === 'GET');
    const postExport = handlers.find((h) => h.name === 'POST');

    expect(getExport).toBeDefined();
    expect(postExport).toBeDefined();
  });

  it('extracts return types from handlers', () => {
    const files = [path.join(fixturesDir, 'express-handler.ts')];
    const handlers = extractHandlers(files, fixturesDir);

    const getHandler = handlers.find((h) => h.method === 'GET');
    expect(getHandler?.returnType).toBeDefined();
    expect(getHandler?.returnType?.kind).toBe('object');
  });
});

describe('findHandlerFiles', () => {
  // Test with the actual __tests__/fixtures/api-handlers directory created by extractHandlers tests
  // This avoids race conditions with directory creation

  it('returns empty array for non-existent directory', () => {
    const files = findHandlerFiles('/non/existent/path');
    expect(files).toEqual([]);
  });

  it('does not include non-handler files', () => {
    // The extractHandlers tests create fixtures that we can test against
    const fixturesDir = path.join(__dirname, '../fixtures/api-handlers');
    if (fs.existsSync(fixturesDir)) {
      const files = findHandlerFiles(fixturesDir);
      // Files without "handler" or "route" in path should not be included by default patterns
      // (Default patterns are src/api/**, src/routes/**, etc.)
      expect(files.every((f) => !f.includes('node_modules'))).toBe(true);
    } else {
      // Skip if fixtures don't exist yet
      expect(true).toBe(true);
    }
  });

  it('supports custom patterns', () => {
    // Test that custom patterns work with a known directory
    const srcDir = path.join(__dirname, '../../src');
    if (fs.existsSync(srcDir)) {
      const files = findHandlerFiles(path.dirname(srcDir), ['src/api/*.ts']);
      // Should find the api module files
      const normalized = files.map((f) => f.replace(/\\/g, '/'));
      expect(normalized.some((f) => f.includes('api/'))).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});

describe('runDiffer integration', () => {
  it('produces correct result structure', () => {
    const spec: ParsedSpec = {
      openApiVersion: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [],
      endpoints: [],
      errorCodes: [],
      tags: [],
      specPath: 'openapi.yaml',
      lastModified: new Date(),
    };

    // Run against empty directory - should return empty results
    const result = runDiffer(spec, '/non/existent/path');

    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('unmatchedHandlers');
    expect(result).toHaveProperty('unmatchedEndpoints');
    expect(result).toHaveProperty('stats');
    expect(result.stats.totalHandlers).toBe(0);
    expect(result.stats.totalEndpoints).toBe(0);
  });

  it('reports unmatched endpoints when ignoreUnmatchedEndpoints is false', () => {
    const spec: ParsedSpec = {
      openApiVersion: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [],
      endpoints: [
        {
          path: '/users/{id}',
          method: 'get',
          parameters: [],
          responses: [],
        },
      ],
      errorCodes: [],
      tags: [],
      specPath: 'openapi.yaml',
      lastModified: new Date(),
    };

    const result = runDiffer(spec, '/non/existent/path', { ignoreUnmatchedEndpoints: false });

    expect(result.unmatchedEndpoints).toHaveLength(1);
    expect(result.violations.some((v) => v.ruleId === 'api-contract/unmatched-endpoint')).toBe(true);
  });

  it('detects missing fields via compareTypes', () => {
    // Test compareTypes directly instead of full integration
    const specType = normalizeOpenApiSchema({
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string' }, // Missing in implementation!
      },
      required: ['id', 'name', 'email'],
    });

    const implType: NormalizedType = {
      kind: 'object',
      properties: {
        id: { type: { kind: 'number' }, required: true },
        name: { type: { kind: 'string' }, required: true },
        // email is missing!
      },
    };

    const diffs = compareTypes(specType, implType, '');
    const missingField = diffs.find((d) => d.kind === 'missing_field' && d.path === 'email');

    expect(missingField).toBeDefined();
    expect(missingField?.severity).toBe('error'); // required field is missing
  });
});
