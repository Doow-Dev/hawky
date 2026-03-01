/**
 * Tests for DATA_CONTRACTS.md Integration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findContractsFile,
  parseContractsFile,
  parseContracts,
  detectDrift,
  checkContractsIntegration,
  formatDriftReport,
  CONTRACT_FILE_LOCATIONS,
  type DocumentedEndpoint,
  type ParsedContracts,
  type DriftViolation,
} from '../../src/api/contracts-integration';
import type { ParsedSpec, SpecEndpoint } from '../../src/api/spec-parser';

describe('contracts-integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-contracts-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // findContractsFile
  // ============================================================================

  describe('findContractsFile', () => {
    it('should find DATA_CONTRACTS.md in root', () => {
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, '# Contracts');

      const result = findContractsFile(tempDir);
      expect(result).toBe(filePath);
    });

    it('should find DATA_CONTRACTS.md in docs/', () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir);
      const filePath = path.join(docsDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, '# Contracts');

      const result = findContractsFile(tempDir);
      expect(result).toBe(filePath);
    });

    it('should find API_CONTRACTS.md as alternative', () => {
      const filePath = path.join(tempDir, 'API_CONTRACTS.md');
      fs.writeFileSync(filePath, '# Contracts');

      const result = findContractsFile(tempDir);
      expect(result).toBe(filePath);
    });

    it('should return null if no contracts file found', () => {
      const result = findContractsFile(tempDir);
      expect(result).toBeNull();
    });

    it('should prefer root over nested locations', () => {
      // Create both
      const rootFile = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(rootFile, '# Root');

      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir);
      const docsFile = path.join(docsDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(docsFile, '# Docs');

      const result = findContractsFile(tempDir);
      expect(result).toBe(rootFile);
    });
  });

  // ============================================================================
  // parseContractsFile
  // ============================================================================

  describe('parseContractsFile', () => {
    it('should parse simple endpoint definition', () => {
      const content = `# API Contracts

## GET /api/users

Get all users.
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints).toHaveLength(1);
      expect(result.contracts?.endpoints[0].method).toBe('get');
      expect(result.contracts?.endpoints[0].path).toBe('/api/users');
    });

    it('should parse multiple endpoints', () => {
      const content = `# API Contracts

## GET /api/users
Get all users.

## POST /api/users
Create a user.

## GET /api/users/{id}
Get user by ID.

## DELETE /api/users/{id}
Delete user.
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints).toHaveLength(4);
      expect(result.contracts?.endpoints.map((e) => e.method)).toEqual([
        'get',
        'post',
        'get',
        'delete',
      ]);
    });

    it('should normalize Express-style path params', () => {
      const content = `## GET /api/users/:id
Get user by ID.
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints[0].path).toBe('/api/users/{id}');
    });

    it('should parse response fields in bullet format', () => {
      const content = `## GET /api/users/{id}

### Response

- \`id\` (string, required): User ID
- \`name\` (string, required): User name
- \`email\` (string, optional): User email
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      const endpoint = result.contracts?.endpoints[0];
      expect(endpoint?.responseFields).toHaveLength(3);
      expect(endpoint?.responseFields?.[0]).toEqual({
        name: 'id',
        type: 'string',
        required: true,
        description: 'User ID',
      });
      expect(endpoint?.responseFields?.[2].required).toBe(false);
    });

    it('should parse request fields', () => {
      const content = `## POST /api/users

### Request

- \`name\` (string, required): User name
- \`email\` (string, required): User email

### Response

- \`id\` (string, required): Created user ID
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      const endpoint = result.contracts?.endpoints[0];
      expect(endpoint?.requestFields).toHaveLength(2);
      expect(endpoint?.responseFields).toHaveLength(1);
    });

    it('should parse table format fields', () => {
      // Note: Header row is skipped because "Type" doesn't match common types
      // and "Required" column says "Required" which parses as required=true
      const content = `## GET /api/users

### Response

| id | string | yes | User ID |
| name | string | yes | User name |
| age | number | no | User age |
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      const endpoint = result.contracts?.endpoints[0];
      expect(endpoint?.responseFields).toHaveLength(3);
      expect(endpoint?.responseFields?.[0].name).toBe('id');
      expect(endpoint?.responseFields?.[2].required).toBe(false);
    });

    it('should parse status codes', () => {
      const content = `## GET /api/users/{id}

Status codes: 200, 404, 500
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints[0].statusCodes).toEqual(['200', '404', '500']);
    });

    it('should handle missing file', () => {
      const result = parseContractsFile('/nonexistent/path.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should capture source line numbers', () => {
      const content = `# API

## GET /api/v1/users

Description here

## POST /api/v1/users

Create user
`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContractsFile(filePath);

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints[0].sourceLine).toBe(3);
      expect(result.contracts?.endpoints[1].sourceLine).toBe(7);
    });
  });

  // ============================================================================
  // parseContracts
  // ============================================================================

  describe('parseContracts', () => {
    it('should find and parse contracts file', () => {
      const content = `## GET /api/health\nHealth check.`;
      const filePath = path.join(tempDir, 'DATA_CONTRACTS.md');
      fs.writeFileSync(filePath, content);

      const result = parseContracts({ rootDir: tempDir });

      expect(result.success).toBe(true);
      expect(result.contracts?.endpoints).toHaveLength(1);
    });

    it('should use custom file path', () => {
      const content = `## GET /api/custom\nCustom endpoint.`;
      const customPath = path.join(tempDir, 'custom-contracts.md');
      fs.writeFileSync(customPath, content);

      const result = parseContracts({ rootDir: tempDir, filePath: customPath });

      expect(result.success).toBe(true);
      expect(result.contracts?.filePath).toBe(customPath);
    });

    it('should return error if no file found', () => {
      const result = parseContracts({ rootDir: tempDir });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No DATA_CONTRACTS.md found');
    });
  });

  // ============================================================================
  // detectDrift
  // ============================================================================

  describe('detectDrift', () => {
    function createContracts(endpoints: DocumentedEndpoint[]): ParsedContracts {
      return {
        endpoints,
        filePath: '/test/DATA_CONTRACTS.md',
        lastModified: new Date(),
        warnings: [],
      };
    }

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

    it('should detect no drift when docs and spec match', () => {
      const contracts = createContracts([
        { method: 'get', path: '/api/users', sourceLine: 1 },
        { method: 'post', path: '/api/users', sourceLine: 5 },
      ]);

      const spec = createSpec([
        { method: 'get', path: '/api/users', parameters: [], responses: [] },
        { method: 'post', path: '/api/users', parameters: [], responses: [] },
      ]);

      const result = detectDrift(contracts, spec);

      expect(result.violations).toHaveLength(0);
      expect(result.matchedCount).toBe(2);
    });

    it('should detect endpoint missing in spec', () => {
      const contracts = createContracts([
        { method: 'get', path: '/api/users', sourceLine: 1 },
        { method: 'delete', path: '/api/users/{id}', sourceLine: 5 },
      ]);

      const spec = createSpec([
        { method: 'get', path: '/api/users', parameters: [], responses: [] },
      ]);

      const result = detectDrift(contracts, spec);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].kind).toBe('endpoint-missing-in-spec');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].method).toBe('delete');
    });

    it('should detect endpoint missing in docs', () => {
      const contracts = createContracts([
        { method: 'get', path: '/api/users', sourceLine: 1 },
      ]);

      const spec = createSpec([
        { method: 'get', path: '/api/users', parameters: [], responses: [] },
        { method: 'post', path: '/api/users', parameters: [], responses: [] },
      ]);

      const result = detectDrift(contracts, spec);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].kind).toBe('endpoint-missing-in-docs');
      expect(result.violations[0].severity).toBe('warning');
    });

    it('should match paths ignoring param names', () => {
      const contracts = createContracts([
        { method: 'get', path: '/api/users/{id}', sourceLine: 1 },
      ]);

      const spec = createSpec([
        { method: 'get', path: '/api/users/{userId}', parameters: [], responses: [] },
      ]);

      const result = detectDrift(contracts, spec);

      expect(result.violations).toHaveLength(0);
      expect(result.matchedCount).toBe(1);
    });

    it('should detect field missing in spec', () => {
      const contracts = createContracts([
        {
          method: 'get',
          path: '/api/users/{id}',
          sourceLine: 1,
          responseFields: [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
            { name: 'legacyField', type: 'string', required: false },
          ],
        },
      ]);

      const spec = createSpec([
        {
          method: 'get',
          path: '/api/users/{id}',
          parameters: [],
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
        },
      ]);

      const result = detectDrift(contracts, spec);

      const fieldMissing = result.violations.find(
        (v) => v.kind === 'field-missing-in-spec' && v.field === 'legacyField'
      );
      expect(fieldMissing).toBeDefined();
    });

    it('should detect field missing in docs', () => {
      const contracts = createContracts([
        {
          method: 'get',
          path: '/api/users/{id}',
          sourceLine: 1,
          responseFields: [{ name: 'id', type: 'string', required: true }],
        },
      ]);

      const spec = createSpec([
        {
          method: 'get',
          path: '/api/users/{id}',
          parameters: [],
          responses: [
            {
              statusCode: '200',
              description: 'Success',
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
              },
            },
          ],
        },
      ]);

      const result = detectDrift(contracts, spec);

      const nameFieldMissing = result.violations.find(
        (v) => v.kind === 'field-missing-in-docs' && v.field === 'name'
      );
      const emailFieldMissing = result.violations.find(
        (v) => v.kind === 'field-missing-in-docs' && v.field === 'email'
      );
      expect(nameFieldMissing).toBeDefined();
      expect(emailFieldMissing).toBeDefined();
    });

    it('should detect status code drift', () => {
      const contracts = createContracts([
        {
          method: 'get',
          path: '/api/users/{id}',
          sourceLine: 1,
          statusCodes: ['200', '404', '500'],
        },
      ]);

      const spec = createSpec([
        {
          method: 'get',
          path: '/api/users/{id}',
          parameters: [],
          responses: [
            { statusCode: '200', description: 'Success' },
            { statusCode: '401', description: 'Unauthorized' },
            { statusCode: '404', description: 'Not found' },
          ],
        },
      ]);

      const result = detectDrift(contracts, spec);

      // 500 documented but not in spec
      const code500 = result.violations.find(
        (v) => v.kind === 'status-code-missing' && v.expected === '500'
      );
      expect(code500).toBeDefined();

      // 401 in spec but not documented
      const code401 = result.violations.find(
        (v) => v.kind === 'status-code-missing' && v.expected === '401'
      );
      expect(code401).toBeDefined();
    });

    it('should provide meaningful summary', () => {
      const contracts = createContracts([
        { method: 'get', path: '/api/users', sourceLine: 1 },
        { method: 'delete', path: '/api/missing', sourceLine: 5 },
      ]);

      const spec = createSpec([
        { method: 'get', path: '/api/users', parameters: [], responses: [] },
      ]);

      const result = detectDrift(contracts, spec);

      expect(result.summary).toContain('1 errors');
      expect(result.summary).toContain('1 endpoints matched');
    });
  });

  // ============================================================================
  // checkContractsIntegration
  // ============================================================================

  describe('checkContractsIntegration', () => {
    it('should pass when no contracts file exists and not required', () => {
      const result = checkContractsIntegration({
        rootDir: tempDir,
        requireContracts: false,
      });

      expect(result.passed).toBe(true);
      expect(result.summary).toContain('not required');
    });

    it('should fail when no contracts file exists and required', () => {
      const result = checkContractsIntegration({
        rootDir: tempDir,
        requireContracts: true,
      });

      expect(result.passed).toBe(false);
      expect(result.summary).toContain('No DATA_CONTRACTS.md found');
    });

    it('should fail when contracts exist but no spec', () => {
      const content = `## GET /api/users\nGet users.`;
      fs.writeFileSync(path.join(tempDir, 'DATA_CONTRACTS.md'), content);

      const result = checkContractsIntegration({ rootDir: tempDir });

      expect(result.passed).toBe(false);
      expect(result.summary).toContain('No OpenAPI spec found');
    });

    it('should run full integration check', () => {
      // Create contracts
      const contractsContent = `## GET /api/users

### Response
- \`id\` (string, required): User ID
- \`name\` (string, required): User name

## POST /api/users

### Request
- \`name\` (string, required): User name
`;
      fs.writeFileSync(path.join(tempDir, 'DATA_CONTRACTS.md'), contractsContent);

      // Create spec
      const specContent = `
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
                  name:
                    type: string
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
`;
      fs.writeFileSync(path.join(tempDir, 'openapi.yaml'), specContent);

      const result = checkContractsIntegration({ rootDir: tempDir });

      expect(result.passed).toBe(true);
      expect(result.contractsPath).toBe(path.join(tempDir, 'DATA_CONTRACTS.md'));
      expect(result.specPath).toBe(path.join(tempDir, 'openapi.yaml'));
    });

    it('should fail when there are error-level drift violations', () => {
      // Contracts with endpoint not in spec
      const contractsContent = `## GET /api/users
## DELETE /api/nonexistent
`;
      fs.writeFileSync(path.join(tempDir, 'DATA_CONTRACTS.md'), contractsContent);

      // Spec without DELETE endpoint
      const specContent = `
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
      fs.writeFileSync(path.join(tempDir, 'openapi.yaml'), specContent);

      const result = checkContractsIntegration({ rootDir: tempDir });

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.kind === 'endpoint-missing-in-spec')).toBe(true);
    });
  });

  // ============================================================================
  // formatDriftReport
  // ============================================================================

  describe('formatDriftReport', () => {
    it('should format empty result', () => {
      const result = {
        passed: true,
        violations: [],
        contractsPath: '/test/DATA_CONTRACTS.md',
        specPath: '/test/openapi.yaml',
        summary: 'No drift detected.',
      };

      const report = formatDriftReport(result);

      expect(report).toContain('Contracts Integration Report');
      expect(report).toContain('DATA_CONTRACTS.md');
      expect(report).toContain('No drift detected');
    });

    it('should format errors and warnings', () => {
      const result = {
        passed: false,
        violations: [
          {
            kind: 'endpoint-missing-in-spec' as const,
            severity: 'error' as const,
            path: '/api/missing',
            method: 'get' as const,
            message: 'Endpoint documented but not in spec',
          },
          {
            kind: 'field-missing-in-docs' as const,
            severity: 'warning' as const,
            path: '/api/users',
            method: 'get' as const,
            field: 'email',
            message: 'Field in spec but not documented',
          },
        ],
        contractsPath: '/test/DATA_CONTRACTS.md',
        specPath: '/test/openapi.yaml',
        summary: '2 drift issues found.',
      };

      const report = formatDriftReport(result);

      expect(report).toContain('## Errors');
      expect(report).toContain('## Warnings');
      expect(report).toContain('/api/missing');
      expect(report).toContain('email');
    });
  });
});
