/**
 * Unit tests for Visual Diff Module
 *
 * Tests pixel diff comparison functionality.
 * Mocks lens-cli and filesystem for isolated testing.
 */

import * as exec from '@actions/exec';
import * as fs from 'fs';
import { diffScreenshots, diffScreenshotBatch, screenshotsMatch } from '../../src/visual/diff';
import type { DiffOptions } from '../../src/visual/types';

// Mock the @actions/exec module
jest.mock('@actions/exec', () => ({
  exec: jest.fn(),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

describe('diffScreenshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('returns error when baseline file does not exist', async () => {
    mockExistsSync.mockImplementation((path) => {
      if (path === '/baseline.png') return false;
      return true;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Baseline screenshot not found');
  });

  it('returns error when current file does not exist', async () => {
    mockExistsSync.mockImplementation((path) => {
      if (path === '/current.png') return false;
      return true;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Current screenshot not found');
  });

  it('returns matched=true when images are identical', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('PASS: Images match within threshold\nDiff: 0%'));
      return 0;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png');

    expect(result.success).toBe(true);
    expect(result.diffPercentage).toBe(0);
    expect(result.matched).toBe(true);
  });

  it('returns matched=false when diff exceeds threshold', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 2.5% (1234 pixels differ)'));
      return 1;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png', { threshold: 0.1 });

    expect(result.success).toBe(true);
    expect(result.diffPercentage).toBe(2.5);
    expect(result.matched).toBe(false);
  });

  it('returns matched=true when diff is within threshold', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('PASS: Images match\nDiff: 0.05% (50 pixels differ)'));
      return 0;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png', { threshold: 0.1 });

    expect(result.success).toBe(true);
    expect(result.diffPercentage).toBe(0.05);
    expect(result.matched).toBe(true);
  });

  it('includes diff image path when differences exist', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 1.5%'));
      return 1;
    });

    // Mock diff image exists
    mockExistsSync.mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('diff-')) return true;
      return true;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png');

    expect(result.success).toBe(true);
    expect(result.diffPercentage).toBe(1.5);
    expect(result.diffImagePath).toBeDefined();
  });

  it('uses custom output path for diff image', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      // Verify custom output path is passed
      expect(args).toContain('/custom/diff.png');
      options?.listeners?.stdout?.(Buffer.from('Diff: 0.5%'));
      return 0;
    });

    const options: DiffOptions = {
      outputPath: '/custom/diff.png',
      threshold: 1.0,
    };

    await diffScreenshots('/baseline.png', '/current.png', options);
  });

  it('passes threshold to lens diff command', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      // Verify threshold is passed correctly (converted from % to decimal)
      const thresholdIndex = args?.indexOf('--threshold');
      if (thresholdIndex !== undefined && thresholdIndex >= 0 && args) {
        expect(args[thresholdIndex + 1]).toBe('0.005'); // 0.5% / 100
      }
      options?.listeners?.stdout?.(Buffer.from('Diff: 0%'));
      return 0;
    });

    await diffScreenshots('/baseline.png', '/current.png', { threshold: 0.5 });
  });

  it('handles lens diff command failure', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stderr?.(Buffer.from('Error: Invalid image format'));
      return 2;
    });

    const result = await diffScreenshots('/baseline.png', '/current.png');

    expect(result.success).toBe(false);
    expect(result.error).toContain('lens diff failed');
  });
});

describe('diffScreenshotBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('compares multiple screenshot pairs', async () => {
    let callCount = 0;
    mockExec.mockImplementation(async (command, args, options) => {
      callCount++;
      options?.listeners?.stdout?.(Buffer.from(`Diff: ${callCount * 0.1}%`));
      return 0;
    });

    const pairs: Array<[string, string]> = [
      ['/baseline1.png', '/current1.png'],
      ['/baseline2.png', '/current2.png'],
      ['/baseline3.png', '/current3.png'],
    ];

    const results = await diffScreenshotBatch(pairs);

    expect(results.length).toBe(3);
    expect(results[0]!.diffPercentage).toBeCloseTo(0.1, 5);
    expect(results[1]!.diffPercentage).toBeCloseTo(0.2, 5);
    expect(results[2]!.diffPercentage).toBeCloseTo(0.3, 5);
  });

  it('returns empty array for empty input', async () => {
    const results = await diffScreenshotBatch([]);

    expect(results).toEqual([]);
  });

  it('applies same options to all comparisons', async () => {
    const thresholds: number[] = [];

    mockExec.mockImplementation(async (command, args, options) => {
      const thresholdIndex = args?.indexOf('--threshold');
      if (thresholdIndex !== undefined && thresholdIndex >= 0 && args) {
        thresholds.push(parseFloat(String(args[thresholdIndex + 1])));
      }
      options?.listeners?.stdout?.(Buffer.from('Diff: 0%'));
      return 0;
    });

    const pairs: Array<[string, string]> = [
      ['/baseline1.png', '/current1.png'],
      ['/baseline2.png', '/current2.png'],
    ];

    await diffScreenshotBatch(pairs, { threshold: 2.0 });

    expect(thresholds.length).toBe(2);
    expect(thresholds[0]).toBe(0.02); // 2.0 / 100
    expect(thresholds[1]).toBe(0.02);
  });
});

describe('screenshotsMatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('returns true when screenshots match', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('PASS: Images match\nDiff: 0%'));
      return 0;
    });

    const result = await screenshotsMatch('/baseline.png', '/current.png');

    expect(result).toBe(true);
  });

  it('returns false when screenshots differ', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      options?.listeners?.stdout?.(Buffer.from('FAIL: Images differ\nDiff: 5%'));
      return 1;
    });

    const result = await screenshotsMatch('/baseline.png', '/current.png');

    expect(result).toBe(false);
  });

  it('returns false when diff operation fails', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await screenshotsMatch('/baseline.png', '/current.png');

    expect(result).toBe(false);
  });

  it('uses custom threshold', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      // With threshold of 5%, a 3% diff should match
      options?.listeners?.stdout?.(Buffer.from('Diff: 3%'));
      return 0;
    });

    const result = await screenshotsMatch('/baseline.png', '/current.png', 5.0);

    expect(result).toBe(true);
  });
});
