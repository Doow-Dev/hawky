/**
 * Tests for Breaking Change Detection
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  compareSpecs,
  detectBreakingChanges,
  formatBreakingChangesReport,
  type SpecChange,
} from '../../src/api/breaking-changes';
import type { ParsedSpec, SpecEndpoint } from '../../src/api/spec-parser';

describe('breaking-changes', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-breaking-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Helper functions
  // ============================================================================

  function createSpec(endpoints: SpecEndpoint[]): ParsedSpec {
    return {
      openApiVersion: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [],
      endpoints,
      errorCodes: [],
      tags: [],
      specPath: '/test/openapi.yaml',
      lastModified: new Date(),
    };
  }

  function createEndpoint(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    overrides: Partial<SpecEndpoint> = {}
  ): SpecEndpoint {
    return {
      method,
      path,
      parameters: [],
      responses: [
        {
          statusCode: '200',
          description: 'Success',
        },
      ],
      ...overrides,
    };
  }

  // ============================================================================
  // compareSpecs - Endpoint changes
  // ============================================================================

  describe('compareSpecs - endpoints', () => {
    it('should detect no changes when specs are identical', () => {
      const spec = createSpec([
        createEndpoint('get', '/api/users'),
        createEndpoint('post', '/api/users'),
      ]);

      const result = compareSpecs(spec, spec);

      expect(result.changes).toHaveLength(0);
      expect(result.hasBreakingChanges).toBe(false);
    });

    it('should detect removed endpoint as breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users'),
        createEndpoint('delete', '/api/users/{id}'),
      ]);
      const curr = createSpec([createEndpoint('get', '/api/users')]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.breakingCount).toBe(1);
      const removed = result.changes.find((c) => c.kind === 'endpoint-removed');
      expect(removed).toBeDefined();
      expect(removed?.path).toBe('/api/users/{id}');
      expect(removed?.method).toBe('delete');
    });

    it('should detect added endpoint as non-breaking', () => {
      const prev = createSpec([createEndpoint('get', '/api/users')]);
      const curr = createSpec([
        createEndpoint('get', '/api/users'),
        createEndpoint('post', '/api/users'),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(false);
      expect(result.nonBreakingCount).toBe(1);
      const added = result.changes.find((c) => c.kind === 'endpoint-added');
      expect(added).toBeDefined();
      expect(added?.method).toBe('post');
    });
  });

  // ============================================================================
  // compareSpecs - Parameter changes
  // ============================================================================

  describe('compareSpecs - parameters', () => {
    it('should detect removed parameter as breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [
            { name: 'page', in: 'query', required: false },
            { name: 'limit', in: 'query', required: false },
          ],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [{ name: 'page', in: 'query', required: false }],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const removed = result.changes.find((c) => c.kind === 'parameter-removed');
      expect(removed).toBeDefined();
      expect(removed?.parameter).toBe('limit');
    });

    it('should detect added required parameter as breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [{ name: 'page', in: 'query', required: false }],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [
            { name: 'page', in: 'query', required: false },
            { name: 'tenant_id', in: 'header', required: true },
          ],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const added = result.changes.find(
        (c) => c.kind === 'required-parameter-added'
      );
      expect(added).toBeDefined();
      expect(added?.parameter).toBe('tenant_id');
    });

    it('should detect added optional parameter as non-breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users', {
          parameters: [{ name: 'search', in: 'query', required: false }],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(false);
      const added = result.changes.find(
        (c) => c.kind === 'optional-parameter-added'
      );
      expect(added).toBeDefined();
    });
  });

  // ============================================================================
  // compareSpecs - Request body changes
  // ============================================================================

  describe('compareSpecs - request body', () => {
    it('should detect removed required request field as breaking', () => {
      const prev = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name', 'email'],
            },
          },
        }),
      ]);
      const curr = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const removed = result.changes.find(
        (c) => c.kind === 'required-field-removed' && c.field === 'email'
      );
      expect(removed).toBeDefined();
    });

    it('should detect added required request field as breaking', () => {
      const prev = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        }),
      ]);
      const curr = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name', 'email'],
            },
          },
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const added = result.changes.find(
        (c) => c.kind === 'required-field-added-to-request'
      );
      expect(added).toBeDefined();
      expect(added?.field).toBe('email');
    });

    it('should detect added optional request field as non-breaking', () => {
      const prev = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        }),
      ]);
      const curr = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                nickname: { type: 'string' },
              },
              required: ['name'],
            },
          },
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(false);
      const added = result.changes.find(
        (c) => c.kind === 'optional-field-added' && c.field === 'nickname'
      );
      expect(added).toBeDefined();
    });

    it('should detect type change in request field as breaking', () => {
      const prev = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                age: { type: 'string' },
              },
            },
          },
        }),
      ]);
      const curr = createSpec([
        createEndpoint('post', '/api/users', {
          requestBody: {
            required: true,
            contentType: 'application/json',
            schema: {
              type: 'object',
              properties: {
                age: { type: 'number' },
              },
            },
          },
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const typeChange = result.changes.find(
        (c) => c.kind === 'type-changed' && c.field === 'age'
      );
      expect(typeChange).toBeDefined();
      expect(typeChange?.before).toBe('string');
      expect(typeChange?.after).toBe('number');
    });
  });

  // ============================================================================
  // compareSpecs - Response changes
  // ============================================================================

  describe('compareSpecs - responses', () => {
    it('should detect removed response field as breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  legacy_field: { type: 'string' },
                },
              },
            },
          ],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          ],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const removed = result.changes.find(
        (c) => c.kind === 'required-field-removed' && c.field === 'legacy_field'
      );
      expect(removed).toBeDefined();
    });

    it('should detect added response field as non-breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                },
              },
            },
          ],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  created_at: { type: 'string' },
                },
              },
            },
          ],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(false);
      const added = result.changes.find(
        (c) => c.kind === 'optional-field-added' && c.field === 'created_at'
      );
      expect(added).toBeDefined();
    });

    it('should detect removed 2xx response as breaking', () => {
      const prev = createSpec([
        createEndpoint('post', '/api/users', {
          responses: [
            { statusCode: '200', description: 'Success' },
            { statusCode: '201', description: 'Created' },
          ],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('post', '/api/users', {
          responses: [{ statusCode: '201', description: 'Created' }],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const removed = result.changes.find((c) => c.kind === 'response-removed');
      expect(removed).toBeDefined();
    });

    it('should detect type change in response field as breaking', () => {
      const prev = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                },
              },
            },
          ],
        }),
      ]);
      const curr = createSpec([
        createEndpoint('get', '/api/users/{id}', {
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  count: { type: 'string' },
                },
              },
            },
          ],
        }),
      ]);

      const result = compareSpecs(prev, curr);

      expect(result.hasBreakingChanges).toBe(true);
      const typeChange = result.changes.find(
        (c) => c.kind === 'type-changed' && c.field === 'count'
      );
      expect(typeChange).toBeDefined();
    });
  });

  // ============================================================================
  // detectBreakingChanges
  // ============================================================================

  describe('detectBreakingChanges', () => {
    it('should compare two spec files', () => {
      // Create previous spec
      const prevContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /api/users:
    get:
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
`;
      const prevPath = path.join(tempDir, 'prev-openapi.yaml');
      fs.writeFileSync(prevPath, prevContent);

      // Create current spec with breaking change
      const currContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 2.0.0
paths:
  /api/users:
    get:
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: number
`;
      const currPath = path.join(tempDir, 'openapi.yaml');
      fs.writeFileSync(currPath, currContent);

      const result = detectBreakingChanges({
        currentSpecPath: currPath,
        previousSpecPath: prevPath,
      });

      expect(result.hasBreakingChanges).toBe(true);
      expect(result.changes.some((c) => c.kind === 'type-changed')).toBe(true);
    });

    it('should handle missing previous spec gracefully', () => {
      const currContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /api/users:
    get:
      responses:
        '200':
          description: Success
`;
      const currPath = path.join(tempDir, 'openapi.yaml');
      fs.writeFileSync(currPath, currContent);

      const result = detectBreakingChanges({
        currentSpecPath: currPath,
        previousSpecPath: '/nonexistent/path.yaml',
      });

      expect(result.hasBreakingChanges).toBe(false);
      expect(result.summary).toContain('No previous spec');
    });
  });

  // ============================================================================
  // formatBreakingChangesReport
  // ============================================================================

  describe('formatBreakingChangesReport', () => {
    it('should format empty result', () => {
      const result = {
        changes: [],
        breakingCount: 0,
        nonBreakingCount: 0,
        hasBreakingChanges: false,
        summary: 'No changes detected.',
      };

      const report = formatBreakingChangesReport(result);

      expect(report).toContain('Breaking Changes Report');
      expect(report).toContain('No changes detected');
    });

    it('should format breaking and non-breaking changes', () => {
      const changes: SpecChange[] = [
        {
          kind: 'endpoint-removed',
          severity: 'error',
          path: '/api/legacy',
          method: 'delete',
          message: 'Endpoint DELETE /api/legacy was removed',
        },
        {
          kind: 'type-changed',
          severity: 'error',
          path: '/api/users',
          method: 'get',
          field: 'count',
          message: 'Response field "count" type changed',
          before: 'number',
          after: 'string',
        },
        {
          kind: 'endpoint-added',
          severity: 'info',
          path: '/api/v2/users',
          method: 'get',
          message: 'Endpoint GET /api/v2/users was added',
        },
      ];

      const result = {
        changes,
        breakingCount: 2,
        nonBreakingCount: 1,
        hasBreakingChanges: true,
        summary: '2 breaking changes, 1 non-breaking changes.',
      };

      const report = formatBreakingChangesReport(result);

      expect(report).toContain('## Breaking Changes');
      expect(report).toContain('## Non-Breaking Changes');
      expect(report).toContain('DELETE /api/legacy');
      expect(report).toContain('number -> string');
      expect(report).toContain('GET /api/v2/users');
    });
  });
});
