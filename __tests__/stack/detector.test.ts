/**
 * Tests for Stack Detection Engine
 *
 * Tests detection logic for all supported stack types.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectStacks,
  getPrimaryStack,
  getStackDetectionConfig,
} from '../../src/stack/detector';
import type { DetectedStack } from '../../src/stack/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

describe('Stack Detection Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectStacks', () => {
    it('should return empty array for empty directory', async () => {
      const result = await detectStacks(tempDir);
      expect(result).toHaveLength(0);
    });

    it('should detect TypeScript stack from tsconfig.json', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const tsStack = result[0];
      expect(tsStack).toBeDefined();
      expect(tsStack?.type).toBe('typescript');
      expect(tsStack?.confidence).toBeGreaterThanOrEqual(0.8);
      expect(tsStack?.markers).toContain('tsconfig.json');
    });

    it('should detect Go stack from go.mod', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'go.mod'),
        'module github.com/test/project\n\ngo 1.21'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const goStack = result[0];
      expect(goStack).toBeDefined();
      expect(goStack?.type).toBe('go');
      expect(goStack?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(goStack?.markers).toContain('go.mod');
    });

    it('should detect Rust stack from Cargo.toml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Cargo.toml'),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const rustStack = result[0];
      expect(rustStack).toBeDefined();
      expect(rustStack?.type).toBe('rust');
      expect(rustStack?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(rustStack?.markers).toContain('Cargo.toml');
    });

    it('should detect Python stack from pyproject.toml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[project]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const pythonStack = result[0];
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.type).toBe('python');
      expect(pythonStack?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect Python stack from requirements.txt', async () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask==2.0.0\n');

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const pythonStack = result[0];
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.type).toBe('python');
      expect(pythonStack?.packageManager).toBe('pip');
    });

    it('should detect Poetry package manager', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "test"'
      );
      fs.writeFileSync(path.join(tempDir, 'poetry.lock'), '');

      const result = await detectStacks(tempDir);

      const pythonStack = result.find((s) => s.type === 'python');
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.packageManager).toBe('poetry');
    });

    it('should detect Terraform stack from .tf files', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'main.tf'),
        'resource "aws_instance" "example" {}'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const tfStack = result[0];
      expect(tfStack).toBeDefined();
      expect(tfStack?.type).toBe('terraform');
      expect(tfStack?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect Docker stack from Dockerfile', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Dockerfile'),
        'FROM node:20\nCOPY . /app'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const dockerStack = result[0];
      expect(dockerStack).toBeDefined();
      expect(dockerStack?.type).toBe('docker');
      expect(dockerStack?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Docker stack from docker-compose.yml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'docker-compose.yml'),
        'version: "3"\nservices:\n  app:\n    build: .'
      );

      const result = await detectStacks(tempDir);

      const dockerStack = result.find((s) => s.type === 'docker');
      expect(dockerStack).toBeDefined();
      expect(dockerStack?.markers).toContain('docker-compose.yml');
    });

    it('should detect Kubernetes stack from kustomization.yaml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'kustomization.yaml'),
        'resources:\n  - deployment.yaml'
      );

      const result = await detectStacks(tempDir);

      expect(result).toHaveLength(1);
      const k8sStack = result[0];
      expect(k8sStack).toBeDefined();
      expect(k8sStack?.type).toBe('kubernetes');
      expect(k8sStack?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Helm chart from Chart.yaml', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'Chart.yaml'),
        'apiVersion: v2\nname: mychart\nversion: 0.1.0'
      );

      const result = await detectStacks(tempDir);

      const k8sStack = result.find((s) => s.type === 'kubernetes');
      expect(k8sStack).toBeDefined();
      expect(k8sStack?.markers).toContain('Chart.yaml');
    });

    it('should detect multiple stacks in polyglot repo', async () => {
      // TypeScript
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      // Docker
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM node:20');

      const result = await detectStacks(tempDir);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.map((s) => s.type)).toContain('typescript');
      expect(result.map((s) => s.type)).toContain('docker');
    });

    it('should sort results by confidence (highest first)', async () => {
      // Go has higher confidence than Docker with .dockerignore
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test\n\ngo 1.21');
      fs.writeFileSync(path.join(tempDir, '.dockerignore'), '*.log');

      const result = await detectStacks(tempDir);

      // Go should come first (0.95) vs Docker (.dockerignore only = 0.5)
      if (result.length >= 2) {
        const firstConfidence = result[0]?.confidence ?? 0;
        const secondConfidence = result[1]?.confidence ?? 0;
        expect(firstConfidence).toBeGreaterThanOrEqual(secondConfidence);
      }
    });

    it('should respect enabled filter', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test');

      const result = await detectStacks(tempDir, { enabled: ['typescript'] });

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('typescript');
    });

    it('should respect disabled filter', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test');

      const result = await detectStacks(tempDir, { disabled: ['typescript'] });

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('go');
    });

    it('should respect minConfidence filter', async () => {
      // .dockerignore has low confidence (0.5)
      fs.writeFileSync(path.join(tempDir, '.dockerignore'), '*.log');

      const lowThreshold = await detectStacks(tempDir, { minConfidence: 0.3 });
      const highThreshold = await detectStacks(tempDir, { minConfidence: 0.8 });

      expect(lowThreshold).toHaveLength(1);
      expect(highThreshold).toHaveLength(0);
    });

    it('should detect npm package manager from package-lock.json', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      const result = await detectStacks(tempDir);
      const tsStack = result.find((s) => s.type === 'typescript');

      expect(tsStack?.packageManager).toBe('npm');
    });

    it('should detect yarn package manager from yarn.lock', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');

      const result = await detectStacks(tempDir);
      const tsStack = result.find((s) => s.type === 'typescript');

      expect(tsStack?.packageManager).toBe('yarn');
    });

    it('should detect pnpm package manager from pnpm-lock.yaml', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');

      const result = await detectStacks(tempDir);
      const tsStack = result.find((s) => s.type === 'typescript');

      expect(tsStack?.packageManager).toBe('pnpm');
    });
  });

  describe('getPrimaryStack', () => {
    it('should return null for empty array', () => {
      const result = getPrimaryStack([]);
      expect(result).toBeNull();
    });

    it('should return the first (highest confidence) stack', () => {
      const stacks: DetectedStack[] = [
        {
          type: 'go',
          confidence: 0.95,
          reason: 'found go.mod',
          markers: ['go.mod'],
          rootDir: tempDir,
        },
        {
          type: 'docker',
          confidence: 0.5,
          reason: 'found .dockerignore',
          markers: ['.dockerignore'],
          rootDir: tempDir,
        },
      ];

      const result = getPrimaryStack(stacks);
      expect(result?.type).toBe('go');
    });
  });

  describe('getStackDetectionConfig', () => {
    it('should return config for valid stack type', () => {
      const config = getStackDetectionConfig('typescript');
      expect(config).toBeDefined();
      expect(config?.type).toBe('typescript');
      expect(config?.markers).toBeDefined();
    });

    it('should return undefined for invalid stack type', () => {
      // @ts-expect-error Testing invalid input
      const config = getStackDetectionConfig('invalid');
      expect(config).toBeUndefined();
    });
  });
});
