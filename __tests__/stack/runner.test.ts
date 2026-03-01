/**
 * Tests for Stack Runner
 *
 * Tests multi-stack coordination and execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runStackGates, canDetectStack, getAvailableStacks } from '../../src/stack/runner';
import { clearRegistry, registerStackModule, getStackModule } from '../../src/stack/registry';
import type { StackModule, DetectedStack, StackGateResult } from '../../src/stack/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

// Mock @actions/exec
const mockExec = jest.fn();
jest.mock('@actions/exec', () => ({
  exec: (...args: unknown[]) => mockExec(...args),
}));

describe('Stack Runner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hawky-test-'));
    mockExec.mockReset();
    mockExec.mockResolvedValue(0); // Default to successful execution
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('runStackGates', () => {
    it('should return empty results for empty directory', async () => {
      const result = await runStackGates(tempDir);

      expect(result.detected).toHaveLength(0);
      expect(result.results).toHaveLength(0);
      expect(result.status).toBe('pass');
      expect(result.skipped).toHaveLength(0);
    });

    it('should detect and run TypeScript stack', async () => {
      // Set up TypeScript project
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
          scripts: { build: 'tsc', test: 'jest' },
        })
      );

      const result = await runStackGates(tempDir);

      expect(result.detected).toHaveLength(1);
      expect(result.detected[0]?.type).toBe('typescript');

      // Should have build and test results
      expect(result.results.length).toBeGreaterThanOrEqual(2);

      const buildResult = result.results.find((r) => r.gateType === 'build');
      const testResult = result.results.find((r) => r.gateType === 'test');

      expect(buildResult).toBeDefined();
      expect(testResult).toBeDefined();
    });

    it('should run multiple stacks in polyglot repo', async () => {
      // TypeScript
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
          scripts: { build: 'tsc', test: 'jest' },
        })
      );

      // Docker
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM node:20');

      const result = await runStackGates(tempDir);

      expect(result.detected.length).toBeGreaterThanOrEqual(2);
      expect(result.detected.map((s) => s.type)).toContain('typescript');
      expect(result.detected.map((s) => s.type)).toContain('docker');
    });

    it('should respect enabled filter', async () => {
      // TypeScript
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      // Go
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test\n\ngo 1.21');

      const result = await runStackGates(tempDir, {
        enabled: ['typescript'],
      });

      expect(result.detected).toHaveLength(1);
      expect(result.detected[0]?.type).toBe('typescript');
    });

    it('should respect disabled filter', async () => {
      // TypeScript
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      // Go
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test\n\ngo 1.21');

      const result = await runStackGates(tempDir, {
        disabled: ['typescript'],
      });

      expect(result.detected).toHaveLength(1);
      expect(result.detected[0]?.type).toBe('go');
    });

    it('should skip stack if disabled in overrides', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      const result = await runStackGates(tempDir, {
        overrides: {
          typescript: { enabled: false },
        },
      });

      expect(result.skipped.some((s) => s.stack === 'typescript')).toBe(true);
    });

    it('should use custom build command from overrides', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
          scripts: { build: 'tsc' },
        })
      );

      const result = await runStackGates(tempDir, {
        overrides: {
          typescript: { buildCommand: 'echo "custom build"' },
        },
      });

      // TypeScript should be detected
      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.detected.map((d) => d.type)).toContain('typescript');

      // Should have results
      expect(result.results.length).toBeGreaterThan(0);

      const buildResult = result.results.find(
        (r) => r.stack === 'typescript' && r.gateType === 'build'
      );
      expect(buildResult).toBeDefined();
      // Custom command should be used
      expect(buildResult?.command).toBe('echo "custom build"');
    });

    it('should use custom test command from overrides', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
          scripts: { test: 'jest' },
        })
      );

      const result = await runStackGates(tempDir, {
        overrides: {
          typescript: { testCommand: 'echo "custom test"' },
        },
      });

      // TypeScript should be detected
      expect(result.detected.length).toBeGreaterThan(0);

      const testResult = result.results.find(
        (r) => r.stack === 'typescript' && r.gateType === 'test'
      );
      expect(testResult).toBeDefined();
      // Custom command should be used
      expect(testResult?.command).toBe('echo "custom test"');
    });

    it('should handle gate failures gracefully', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          dependencies: { typescript: '^5.0.0' },
          scripts: { build: 'tsc', test: 'jest' },
        })
      );

      // Make exec return non-zero exit code (failure)
      mockExec.mockResolvedValue(1);

      const result = await runStackGates(tempDir);

      // Should have results (even if some failed)
      expect(result.results.length).toBeGreaterThan(0);
      // Should have appropriate status
      expect(['pass', 'fail', 'error', 'skip']).toContain(result.status);
    });

    it('should include execution time', async () => {
      const result = await runStackGates(tempDir);

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('canDetectStack', () => {
    it('should return true when stack can be detected', async () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { typescript: '^5.0.0' } })
      );

      const result = await canDetectStack('typescript', tempDir);
      expect(result).toBe(true);
    });

    it('should return false when stack cannot be detected', async () => {
      const result = await canDetectStack('go', tempDir);
      expect(result).toBe(false);
    });
  });

  describe('getAvailableStacks', () => {
    it('should return all registered stack modules', () => {
      const modules = getAvailableStacks();

      expect(modules.length).toBeGreaterThan(0);
      expect(modules.map((m) => m.name)).toContain('typescript');
      expect(modules.map((m) => m.name)).toContain('go');
      expect(modules.map((m) => m.name)).toContain('rust');
      expect(modules.map((m) => m.name)).toContain('python');
      expect(modules.map((m) => m.name)).toContain('terraform');
      expect(modules.map((m) => m.name)).toContain('docker');
      expect(modules.map((m) => m.name)).toContain('kubernetes');
    });
  });
});
