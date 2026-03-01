/**
 * Unit tests for Visual Screenshot Module
 *
 * Tests screenshot capture and API mocking functionality.
 * Mocks lens-cli calls for isolated testing.
 */

import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import { captureScreenshot, captureWithMocks, stopHeadlessBrowser } from '../../src/visual/screenshot';
import type { ApiMock, ScreenshotOptions } from '../../src/visual/types';

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

const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('captureScreenshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('fake-png-data'));
  });

  it('captures screenshot with default options', async () => {
    // Mock successful headless status
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      return 0;
    });

    const result = await captureScreenshot('https://example.com');

    expect(result.success).toBe(true);
    expect(result.path).toBeDefined();
    expect(result.metadata?.url).toBe('https://example.com');
    expect(result.metadata?.viewport.width).toBe(1280);
    expect(result.metadata?.viewport.height).toBe(720);
  });

  it('captures screenshot with custom viewport', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      return 0;
    });

    const options: ScreenshotOptions = {
      viewport: { width: 1920, height: 1080, name: 'desktop' },
    };

    const result = await captureScreenshot('https://example.com', options);

    expect(result.success).toBe(true);
    expect(result.metadata?.viewport.width).toBe(1920);
    expect(result.metadata?.viewport.height).toBe(1080);
    expect(result.metadata?.viewport.name).toBe('desktop');
  });

  it('starts headless browser if not running', async () => {
    let startCalled = false;

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('not running'));
        return 1;
      }
      if (args?.includes('headless.start')) {
        startCalled = true;
        return 0;
      }
      return 0;
    });

    await captureScreenshot('https://example.com');

    expect(startCalled).toBe(true);
  });

  it('returns error when headless start fails', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('not running'));
        return 1;
      }
      if (args?.includes('headless.start')) {
        options?.listeners?.stderr?.(Buffer.from('Failed to start'));
        return 1;
      }
      return 0;
    });

    const result = await captureScreenshot('https://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to start headless browser');
  });

  it('returns error when navigation fails', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('open')) {
        options?.listeners?.stderr?.(Buffer.from('Navigation failed'));
        return 1;
      }
      return 0;
    });

    const result = await captureScreenshot('https://example.com');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to navigate');
  });

  it('waits for selector when specified', async () => {
    let jsCheckCalled = false;

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('js')) {
        jsCheckCalled = true;
        options?.listeners?.stdout?.(Buffer.from('true'));
        return 0;
      }
      return 0;
    });

    const options: ScreenshotOptions = {
      waitFor: '#main-content',
      timeout: 5000,
    };

    await captureScreenshot('https://example.com', options);

    expect(jsCheckCalled).toBe(true);
  });

  it('creates output directory if not exists', async () => {
    mockExistsSync.mockReturnValueOnce(false); // First call for directory check

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      return 0;
    });

    await captureScreenshot('https://example.com', {
      outputDir: '/custom/output/dir',
    });

    expect(mockMkdirSync).toHaveBeenCalledWith('/custom/output/dir', { recursive: true });
  });
});

describe('captureWithMocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('fake-png-data'));
  });

  it('sets up API mocks before capture', async () => {
    const interceptCalls: string[] = [];

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('intercept') && !args.includes('intercept.clear')) {
        interceptCalls.push(args.join(' '));
        return 0;
      }
      return 0;
    });

    const mocks: ApiMock[] = [
      { route: '*/api/data*', response: { items: [] } },
      { route: '*/api/user*', response: { name: 'Test' }, status: 200 },
    ];

    await captureWithMocks('https://example.com', mocks);

    expect(interceptCalls.length).toBe(2);
    expect(interceptCalls[0]).toContain('*/api/data*');
    expect(interceptCalls[1]).toContain('*/api/user*');
  });

  it('clears mocks after capture', async () => {
    let clearCalled = false;

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('intercept.clear')) {
        clearCalled = true;
        return 0;
      }
      return 0;
    });

    await captureWithMocks('https://example.com', []);

    expect(clearCalled).toBe(true);
  });

  it('clears mocks even when capture fails', async () => {
    let clearCalled = false;

    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('open')) {
        options?.listeners?.stderr?.(Buffer.from('Navigation failed'));
        return 1;
      }
      if (args?.includes('intercept.clear')) {
        clearCalled = true;
        return 0;
      }
      return 0;
    });

    await captureWithMocks('https://example.com', []);

    expect(clearCalled).toBe(true);
  });

  it('returns error when mock setup fails', async () => {
    mockExec.mockImplementation(async (command, args, options) => {
      if (args?.includes('headless.status')) {
        options?.listeners?.stdout?.(Buffer.from('running'));
        return 0;
      }
      if (args?.includes('intercept') && !args.includes('intercept.clear')) {
        options?.listeners?.stderr?.(Buffer.from('Mock setup failed'));
        return 1;
      }
      return 0;
    });

    const result = await captureWithMocks('https://example.com', [
      { route: '*/api/*', response: {} },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to set up mock');
  });
});

describe('stopHeadlessBrowser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops the headless browser', async () => {
    let stopCalled = false;

    mockExec.mockImplementation(async (command, args) => {
      if (args?.includes('headless.stop')) {
        stopCalled = true;
        return 0;
      }
      return 0;
    });

    await stopHeadlessBrowser();

    expect(stopCalled).toBe(true);
  });
});
