/**
 * Tests for Stack Module Registry
 *
 * Tests module registration and lookup.
 */

import {
  registerStackModule,
  getStackModule,
  getAllStackModules,
  hasStackModule,
  getRegisteredStackTypes,
  clearRegistry,
  getRegistrySize,
} from '../../src/stack/registry';
import type { StackModule, DetectedStack, StackGateResult } from '../../src/stack/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

describe('Stack Module Registry', () => {
  // Clear registry before each test to isolate tests
  beforeEach(() => {
    clearRegistry();
  });

  // Create a mock module for testing
  const createMockModule = (name: string): StackModule => ({
    name: name as StackModule['name'],
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    detect: async (_rootDir: string): Promise<DetectedStack | null> => null,
    getBuildCommand: async (_rootDir: string): Promise<string | null> => null,
    getTestCommand: async (_rootDir: string): Promise<string | null> => null,
    getLintCommand: async (_rootDir: string): Promise<string | null> => null,
    getSecurityCommand: async (_rootDir: string): Promise<string | null> => null,
    runBuild: async (_rootDir: string, _timeoutMs: number): Promise<StackGateResult> => ({
      stack: name as StackGateResult['stack'],
      gateType: 'build',
      gate: `${name}-build` as StackGateResult['gate'],
      status: 'pass',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: 0,
      message: 'Build passed',
      command: '',
    }),
    runTests: async (_rootDir: string, _timeoutMs: number): Promise<StackGateResult> => ({
      stack: name as StackGateResult['stack'],
      gateType: 'test',
      gate: `${name}-test` as StackGateResult['gate'],
      status: 'pass',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: 0,
      message: 'Tests passed',
      command: '',
    }),
  });

  describe('registerStackModule', () => {
    it('should register a module successfully', () => {
      const module = createMockModule('typescript');
      registerStackModule(module);

      expect(hasStackModule('typescript')).toBe(true);
      expect(getRegistrySize()).toBe(1);
    });

    it('should throw when registering duplicate module', () => {
      const module = createMockModule('typescript');
      registerStackModule(module);

      expect(() => registerStackModule(module)).toThrow(
        "Stack module 'typescript' is already registered"
      );
    });

    it('should allow registering multiple different modules', () => {
      registerStackModule(createMockModule('typescript'));
      registerStackModule(createMockModule('go'));
      registerStackModule(createMockModule('rust'));

      expect(getRegistrySize()).toBe(3);
    });
  });

  describe('getStackModule', () => {
    it('should return registered module', () => {
      const module = createMockModule('typescript');
      registerStackModule(module);

      const retrieved = getStackModule('typescript');
      expect(retrieved).toBe(module);
    });

    it('should return undefined for unregistered module', () => {
      const retrieved = getStackModule('typescript');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllStackModules', () => {
    it('should return empty array when no modules registered', () => {
      const modules = getAllStackModules();
      expect(modules).toHaveLength(0);
    });

    it('should return all registered modules', () => {
      registerStackModule(createMockModule('typescript'));
      registerStackModule(createMockModule('go'));

      const modules = getAllStackModules();
      expect(modules).toHaveLength(2);
      expect(modules.map((m) => m.name)).toContain('typescript');
      expect(modules.map((m) => m.name)).toContain('go');
    });
  });

  describe('hasStackModule', () => {
    it('should return false for unregistered module', () => {
      expect(hasStackModule('typescript')).toBe(false);
    });

    it('should return true for registered module', () => {
      registerStackModule(createMockModule('typescript'));
      expect(hasStackModule('typescript')).toBe(true);
    });
  });

  describe('getRegisteredStackTypes', () => {
    it('should return empty array when no modules registered', () => {
      const types = getRegisteredStackTypes();
      expect(types).toHaveLength(0);
    });

    it('should return all registered stack types', () => {
      registerStackModule(createMockModule('typescript'));
      registerStackModule(createMockModule('go'));
      registerStackModule(createMockModule('rust'));

      const types = getRegisteredStackTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain('typescript');
      expect(types).toContain('go');
      expect(types).toContain('rust');
    });
  });

  describe('clearRegistry', () => {
    it('should remove all registered modules', () => {
      registerStackModule(createMockModule('typescript'));
      registerStackModule(createMockModule('go'));

      expect(getRegistrySize()).toBe(2);

      clearRegistry();

      expect(getRegistrySize()).toBe(0);
      expect(hasStackModule('typescript')).toBe(false);
      expect(hasStackModule('go')).toBe(false);
    });
  });
});
