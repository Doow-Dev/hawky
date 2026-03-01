/**
 * Tests for OpenAPI Spec Parser
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  parseSpec,
  isOpenApiSpec,
  findSpecFiles,
  getStatusCodes,
  getEndpointsByTag,
  getErrorResponses,
  HTTP_METHODS,
} from '../../src/api/spec-parser';

describe('spec-parser', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/openapi');
  const petstorePath = path.join(fixturesDir, 'petstore.yaml');

  describe('isOpenApiSpec', () => {
    it('should return true for valid OpenAPI 3.x spec', () => {
      expect(isOpenApiSpec(petstorePath)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(isOpenApiSpec('/nonexistent.yaml')).toBe(false);
    });

    it('should return false for non-YAML/JSON file', () => {
      const tsFile = path.join(__dirname, '../../src/api/spec-parser.ts');
      expect(isOpenApiSpec(tsFile)).toBe(false);
    });
  });

  describe('findSpecFiles', () => {
    it('should find spec files in directory', () => {
      // Create a temp directory with a spec file
      const tempDir = path.join(fixturesDir, 'temp-find-test');
      const specPath = path.join(tempDir, 'openapi.yaml');

      // Create temp dir and copy spec
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      fs.copyFileSync(petstorePath, specPath);

      try {
        const specs = findSpecFiles(tempDir);
        expect(specs).toContain(specPath);
      } finally {
        // Cleanup
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should return empty array for directory without specs', () => {
      const specs = findSpecFiles('/nonexistent');
      expect(specs).toEqual([]);
    });
  });

  describe('parseSpec', () => {
    it('should parse valid OpenAPI spec', () => {
      const result = parseSpec(petstorePath);

      expect(result.success).toBe(true);
      expect(result.spec).toBeDefined();
    });

    it('should extract API info', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.info.title).toBe('Pet Store API');
      expect(result.spec?.info.version).toBe('1.0.0');
      expect(result.spec?.info.description).toContain('sample API');
    });

    it('should extract servers', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.servers).toHaveLength(1);
      expect(result.spec?.servers[0].url).toContain('petstore');
    });

    it('should extract endpoints', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.endpoints.length).toBeGreaterThan(0);

      // Find GET /pets endpoint
      const listPets = result.spec?.endpoints.find(
        (e) => e.path === '/pets' && e.method === 'get'
      );
      expect(listPets).toBeDefined();
      expect(listPets?.operationId).toBe('listPets');
      expect(listPets?.summary).toBe('List all pets');
    });

    it('should extract path parameters', () => {
      const result = parseSpec(petstorePath);

      const getPet = result.spec?.endpoints.find(
        (e) => e.path === '/pets/{petId}' && e.method === 'get'
      );
      expect(getPet).toBeDefined();

      const pathParam = getPet?.parameters.find((p) => p.name === 'petId');
      expect(pathParam).toBeDefined();
      expect(pathParam?.in).toBe('path');
      expect(pathParam?.required).toBe(true);
    });

    it('should extract query parameters', () => {
      const result = parseSpec(petstorePath);

      const listPets = result.spec?.endpoints.find(
        (e) => e.path === '/pets' && e.method === 'get'
      );
      expect(listPets).toBeDefined();

      const limitParam = listPets?.parameters.find((p) => p.name === 'limit');
      expect(limitParam).toBeDefined();
      expect(limitParam?.in).toBe('query');
      expect(limitParam?.required).toBe(false);
    });

    it('should extract request body', () => {
      const result = parseSpec(petstorePath);

      const createPet = result.spec?.endpoints.find(
        (e) => e.path === '/pets' && e.method === 'post'
      );
      expect(createPet).toBeDefined();
      expect(createPet?.requestBody).toBeDefined();
      expect(createPet?.requestBody?.required).toBe(true);
      expect(createPet?.requestBody?.contentType).toBe('application/json');
    });

    it('should extract responses', () => {
      const result = parseSpec(petstorePath);

      const listPets = result.spec?.endpoints.find(
        (e) => e.path === '/pets' && e.method === 'get'
      );
      expect(listPets).toBeDefined();

      const resp200 = listPets?.responses.find((r) => r.statusCode === '200');
      expect(resp200).toBeDefined();
      expect(resp200?.description).toBe('A list of pets');

      const resp400 = listPets?.responses.find((r) => r.statusCode === '400');
      expect(resp400).toBeDefined();
    });

    it('should extract security requirements', () => {
      const result = parseSpec(petstorePath);

      const deletePet = result.spec?.endpoints.find(
        (e) => e.path === '/pets/{petId}' && e.method === 'delete'
      );
      expect(deletePet).toBeDefined();
      expect(deletePet?.security).toBeDefined();
      expect(deletePet?.security?.[0]).toHaveProperty('bearerAuth');
    });

    it('should detect deprecated endpoints', () => {
      const result = parseSpec(petstorePath);

      const deprecated = result.spec?.endpoints.find(
        (e) => e.path === '/deprecated'
      );
      expect(deprecated).toBeDefined();
      expect(deprecated?.deprecated).toBe(true);
    });

    it('should extract tags', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.tags).toContain('pets');
      expect(result.spec?.tags).toContain('users');
    });

    it('should extract error codes', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.errorCodes.length).toBeGreaterThan(0);

      const errors = result.spec?.errorCodes || [];
      expect(errors.some((e) => e.statusCode === '400')).toBe(true);
      expect(errors.some((e) => e.statusCode === '401')).toBe(true);
      expect(errors.some((e) => e.statusCode === '404')).toBe(true);
      expect(errors.some((e) => e.statusCode === '500')).toBe(true);
    });

    it('should set specPath and lastModified', () => {
      const result = parseSpec(petstorePath);

      expect(result.spec?.specPath).toBe(petstorePath);
      expect(result.spec?.lastModified).toBeDefined();
      // Check it's a valid date by converting to timestamp
      expect(typeof result.spec?.lastModified.getTime()).toBe('number');
      expect(result.spec?.lastModified.getTime()).toBeGreaterThan(0);
    });

    it('should fail for non-existent file', () => {
      const result = parseSpec('/nonexistent.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should fail for invalid YAML', () => {
      const invalidPath = path.join(fixturesDir, 'invalid.yaml');
      fs.writeFileSync(invalidPath, 'invalid: yaml: content:');

      try {
        const result = parseSpec(invalidPath);
        expect(result.success).toBe(false);
      } finally {
        fs.unlinkSync(invalidPath);
      }
    });

    it('should fail for non-OpenAPI 3.x', () => {
      const swagger2Path = path.join(fixturesDir, 'swagger2.yaml');
      fs.writeFileSync(
        swagger2Path,
        'swagger: "2.0"\ninfo:\n  title: Test\n  version: "1.0"\npaths: {}'
      );

      try {
        const result = parseSpec(swagger2Path);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Unsupported OpenAPI version');
      } finally {
        fs.unlinkSync(swagger2Path);
      }
    });
  });

  describe('getStatusCodes', () => {
    it('should return unique status codes', () => {
      const result = parseSpec(petstorePath);
      if (!result.spec) throw new Error('Parse failed');

      const codes = getStatusCodes(result.spec);

      expect(codes).toContain('200');
      expect(codes).toContain('201');
      expect(codes).toContain('204');
      expect(codes).toContain('400');
      expect(codes).toContain('401');
      expect(codes).toContain('404');

      // Should be sorted
      expect(codes).toEqual([...codes].sort());

      // Should be unique
      expect(codes.length).toBe(new Set(codes).size);
    });
  });

  describe('getEndpointsByTag', () => {
    it('should filter endpoints by tag', () => {
      const result = parseSpec(petstorePath);
      if (!result.spec) throw new Error('Parse failed');

      const petEndpoints = getEndpointsByTag(result.spec, 'pets');
      expect(petEndpoints.length).toBeGreaterThan(0);
      expect(petEndpoints.every((e) => e.tags?.includes('pets'))).toBe(true);

      const userEndpoints = getEndpointsByTag(result.spec, 'users');
      expect(userEndpoints.length).toBeGreaterThan(0);
      expect(userEndpoints.every((e) => e.tags?.includes('users'))).toBe(true);
    });

    it('should return empty array for unknown tag', () => {
      const result = parseSpec(petstorePath);
      if (!result.spec) throw new Error('Parse failed');

      const endpoints = getEndpointsByTag(result.spec, 'nonexistent');
      expect(endpoints).toEqual([]);
    });
  });

  describe('getErrorResponses', () => {
    it('should return all 4xx and 5xx responses', () => {
      const result = parseSpec(petstorePath);
      if (!result.spec) throw new Error('Parse failed');

      const errors = getErrorResponses(result.spec);

      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.every(
          (e) => e.statusCode.startsWith('4') || e.statusCode.startsWith('5')
        )
      ).toBe(true);
    });
  });

  describe('HTTP_METHODS', () => {
    it('should contain all standard HTTP methods', () => {
      expect(HTTP_METHODS).toContain('get');
      expect(HTTP_METHODS).toContain('post');
      expect(HTTP_METHODS).toContain('put');
      expect(HTTP_METHODS).toContain('patch');
      expect(HTTP_METHODS).toContain('delete');
      expect(HTTP_METHODS).toContain('head');
      expect(HTTP_METHODS).toContain('options');
      expect(HTTP_METHODS).toContain('trace');
    });
  });
});
