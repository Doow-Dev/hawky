/**
 * Unit tests for Visual Gate
 *
 * Tests the visual regression gate integration.
 */

import * as exec from '@actions/exec';
import * as fs from 'fs';
import { visualGate, runVisualGate, resultToAnnotation } from '../../src/gates/visual';
import type { VisualConfig } from '../../src/config/types';
import type { GateRunOptions } from '../../src/gates/types';
import type { VisualTestResult, Viewport } from '../../src/visual/types';

// Mock the @actions/exec module
jest.mock('@actions/exec', () => ({
  exec: jest.fn(),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('visualGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env['HAWKY_VISUAL_ENABLED'];
    delete process.env['HAWKY_VISUAL_ROUTES'];
    delete process.env['HAWKY_VISUAL_THRESHOLD'];
    delete process.env['HAWKY_VISUAL_BASELINE_DIR'];
    delete process.env['HAWKY_VISUAL_CURRENT_DIR'];
  });

  describe('metadata', () => {
    it('has correct name', () => {
      expect(visualGate.name).toBe('visual');
    });

    it('has correct display name', () => {
      expect(visualGate.displayName).toBe('Visual Regression');
    });
  });

  describe('canRun', () => {
    it('returns true', async () => {
      const result = await visualGate.canRun('/some/path');
      expect(result).toBe(true);
    });
  });

  describe('run', () => {
    const defaultOptions: GateRunOptions = {
      cwd: '/repo',
      timeoutMs: 60000,
      createAnnotations: true,
    };

    it('skips when not enabled', async () => {
      process.env['HAWKY_VISUAL_ENABLED'] = 'false';

      const result = await visualGate.run(defaultOptions);

      expect(result.status).toBe('skip');
      expect(result.message).toContain('not enabled');
    });

    it('skips when no routes configured', async () => {
      process.env['HAWKY_VISUAL_ENABLED'] = 'true';
      process.env['HAWKY_VISUAL_ROUTES'] = '';

      const result = await visualGate.run(defaultOptions);

      expect(result.status).toBe('skip');
      expect(result.message).toContain('no routes');
    });

    it('returns gate name in result', async () => {
      process.env['HAWKY_VISUAL_ENABLED'] = 'false';

      const result = await visualGate.run(defaultOptions);

      expect(result.gate).toBe('visual');
    });

    it('includes timing information', async () => {
      process.env['HAWKY_VISUAL_ENABLED'] = 'false';

      const result = await visualGate.run(defaultOptions);

      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('runVisualGate', () => {
  const defaultOptions: GateRunOptions = {
    cwd: '/repo',
    timeoutMs: 60000,
    createAnnotations: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('fake-png-data'));
  });

  it('skips when not enabled', async () => {
    const config: VisualConfig = {
      enabled: false,
      routes: ['/home'],
    };

    const result = await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(result.status).toBe('skip');
    expect(result.message).toContain('not enabled');
  });

  it('skips when no routes configured', async () => {
    const config: VisualConfig = {
      enabled: true,
      routes: [],
    };

    const result = await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(result.status).toBe('skip');
    expect(result.message).toContain('no routes');
  });

  it('creates directories if they do not exist', async () => {
    // Need actual routes for the gate to create directories
    mockExistsSync.mockReturnValue(false);
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      return 0;
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com'],
    };

    await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(mockMkdirSync).toHaveBeenCalledWith('/baseline', { recursive: true });
    expect(mockMkdirSync).toHaveBeenCalledWith('/current', { recursive: true });
  });

  it('returns pass when all visual tests pass', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('diff')) {
        options?.listeners?.stdout?.(Buffer.from('PASS: Images match\nDiff: 0%'));
        return 0;
      }
      return 0;
    });

    // Mock baseline exists
    mockExistsSync.mockImplementation((path) => {
      return true;
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com/home'],
      threshold: 0.1,
    };

    const result = await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(result.status).toBe('pass');
    expect(result.violations.length).toBe(0);
  });

  it('returns fail when visual tests detect regressions', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('diff')) {
        options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 5%'));
        return 1;
      }
      return 0;
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com/home'],
      threshold: 0.1,
    };

    const result = await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(result.status).toBe('fail');
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]!.ruleId).toBe('visual/regression');
  });

  it('creates annotations when createAnnotations is true', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('diff')) {
        options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 5%'));
        return 1;
      }
      return 0;
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com/home'],
    };

    const result = await runVisualGate(config, '/baseline', '/current', {
      ...defaultOptions,
      createAnnotations: true,
    });

    expect(result.annotations.length).toBeGreaterThan(0);
  });

  it('does not create annotations when createAnnotations is false', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('diff')) {
        options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 5%'));
        return 1;
      }
      return 0;
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com/home'],
    };

    const result = await runVisualGate(config, '/baseline', '/current', {
      ...defaultOptions,
      createAnnotations: false,
    });

    expect(result.annotations.length).toBe(0);
  });

  it('returns error status on exception', async () => {
    mockExec.mockImplementation(async () => {
      throw new Error('Unexpected error');
    });

    const config: VisualConfig = {
      enabled: true,
      routes: ['https://example.com/home'],
    };

    const result = await runVisualGate(config, '/baseline', '/current', defaultOptions);

    expect(result.status).toBe('error');
    expect(result.error).toBe('Unexpected error');
  });
});

describe('resultToAnnotation', () => {
  const viewport: Viewport = { width: 1920, height: 1080, name: 'desktop' };

  it('creates annotation for regression', () => {
    const result: VisualTestResult = {
      route: '/home',
      viewport,
      diffPercentage: 2.5,
      passed: false,
      baselinePath: '/baseline.png',
      currentPath: '/current.png',
    };

    const annotation = resultToAnnotation(result);

    expect(annotation.file).toBe('/home');
    expect(annotation.line).toBe(1);
    expect(annotation.severity).toBe('warning');
    expect(annotation.ruleId).toBe('visual/regression');
    expect(annotation.message).toContain('2.50%');
    expect(annotation.title).toContain('desktop');
  });

  it('creates annotation for error', () => {
    const result: VisualTestResult = {
      route: '/home',
      viewport,
      diffPercentage: 0,
      passed: false,
      baselinePath: '/baseline.png',
      currentPath: '/current.png',
      error: 'Screenshot capture failed',
    };

    const annotation = resultToAnnotation(result);

    expect(annotation.severity).toBe('error');
    expect(annotation.message).toContain('Screenshot capture failed');
  });

  it('uses viewport dimensions when no name', () => {
    const result: VisualTestResult = {
      route: '/home',
      viewport: { width: 768, height: 1024 },
      diffPercentage: 1.0,
      passed: false,
      baselinePath: '/baseline.png',
      currentPath: '/current.png',
    };

    const annotation = resultToAnnotation(result);

    expect(annotation.title).toContain('768x1024');
  });
});
