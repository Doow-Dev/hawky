/**
 * Visual Screenshot Module
 *
 * Captures screenshots using lens-cli for visual regression testing.
 * Supports viewport configuration, wait conditions, and API mocking.
 *
 * S066: lens-cli Screenshot Integration
 * S069: State Mocking
 */

import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type {
  ApiMock,
  ScreenshotMetadata,
  ScreenshotOptions,
  ScreenshotResult,
  Viewport,
} from './types';
import { DEFAULT_OUTPUT_DIR, DEFAULT_TIMEOUT } from './types';

/**
 * Default viewport dimensions
 */
const DEFAULT_VIEWPORT: Viewport = {
  width: 1280,
  height: 720,
  name: 'default',
};

/**
 * Generate a unique filename for a screenshot
 */
function generateFilename(url: string, viewport: Viewport): string {
  const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  const viewportSuffix = viewport.name ?? `${viewport.width}x${viewport.height}`;
  const timestamp = Date.now();
  return `screenshot-${urlHash}-${viewportSuffix}-${timestamp}.png`;
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Execute lens-cli command and capture output
 */
async function execLens(
  args: string[],
  cwd?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  const execOptions: exec.ExecOptions = {
    silent: true,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      },
    },
  };

  // Only set cwd if defined
  if (cwd !== undefined) {
    execOptions.cwd = cwd;
  }

  const exitCode = await exec.exec('lens', args, execOptions);

  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * Capture a screenshot of a URL using lens-cli
 *
 * Uses lens headless mode for CI compatibility:
 * - lens headless.start (if not running)
 * - lens headless open <url>
 * - lens headless screenshot --output <path>
 * - Applies viewport via resize
 *
 * @param url - URL to capture
 * @param options - Screenshot options
 * @returns Screenshot result with path and metadata
 */
export async function captureScreenshot(
  url: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const startTime = Date.now();

  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const filename = options.filename ?? generateFilename(url, viewport);
  const outputPath = path.join(outputDir, filename);

  try {
    // Ensure output directory exists
    ensureOutputDir(outputDir);

    // Start headless browser if not running
    const statusResult = await execLens(['headless.status']);
    if (statusResult.exitCode !== 0 || !statusResult.stdout.includes('running')) {
      const startResult = await execLens(['headless.start']);
      if (startResult.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to start headless browser: ${startResult.stderr}`,
        };
      }
      // Give browser time to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Set viewport via resize
    const resizeResult = await execLens([
      'headless',
      'resize',
      String(viewport.width),
      String(viewport.height),
    ]);
    if (resizeResult.exitCode !== 0) {
      // Resize failure is non-fatal, continue with default viewport
    }

    // Navigate to URL
    const openResult = await execLens(['headless', 'open', url]);
    if (openResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to navigate to ${url}: ${openResult.stderr}`,
      };
    }

    // Wait for selector if specified
    if (options.waitFor) {
      const waitScript = `document.querySelector('${options.waitFor}') !== null`;
      const maxAttempts = Math.ceil(timeout / 500);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const checkResult = await execLens(['headless', 'js', waitScript]);
        if (checkResult.stdout === 'true') {
          break;
        }
        if (attempt === maxAttempts - 1) {
          return {
            success: false,
            error: `Timeout waiting for selector: ${options.waitFor}`,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } else {
      // Default wait for page load
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Capture screenshot
    const screenshotResult = await execLens(['headless', 'screenshot', '--output', outputPath]);
    if (screenshotResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to capture screenshot: ${screenshotResult.stderr}`,
      };
    }

    // Verify screenshot was created
    if (!fs.existsSync(outputPath)) {
      return {
        success: false,
        error: `Screenshot file not created: ${outputPath}`,
      };
    }

    // Read buffer for return
    const buffer = fs.readFileSync(outputPath).toString('base64');

    const captureTimeMs = Date.now() - startTime;

    const metadata: ScreenshotMetadata = {
      url,
      viewport,
      timestamp: new Date(),
      captureTimeMs,
    };

    return {
      success: true,
      path: outputPath,
      buffer,
      metadata,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during screenshot capture',
    };
  }
}

/**
 * Set up API mocks using lens intercept
 *
 * @param mocks - Array of API mocks to set up
 * @returns Whether all mocks were set up successfully
 */
async function setupMocks(mocks: ApiMock[]): Promise<{ success: boolean; error?: string }> {
  for (const mock of mocks) {
    const responseJson = JSON.stringify(mock.response);
    const args = ['headless', 'intercept', mock.route, '--response', responseJson];

    if (mock.status !== undefined && mock.status !== 200) {
      args.push('--status', String(mock.status));
    }

    const result = await execLens(args);
    if (result.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to set up mock for ${mock.route}: ${result.stderr}`,
      };
    }
  }

  return { success: true };
}

/**
 * Clear all API mocks
 */
async function clearMocks(): Promise<void> {
  await execLens(['headless', 'intercept.clear']);
}

/**
 * Capture a screenshot with API mocking for state control
 *
 * S069: State Mocking
 *
 * Uses lens intercept to mock API responses before capture.
 * Cleans up mocks after capture to avoid state leakage.
 *
 * @param url - URL to capture
 * @param mocks - API mocks to apply
 * @param options - Screenshot options
 * @returns Screenshot result with path and metadata
 */
export async function captureWithMocks(
  url: string,
  mocks: ApiMock[],
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  try {
    // Set up mocks before capture
    const mockResult = await setupMocks(mocks);
    if (!mockResult.success) {
      return {
        success: false,
        error: mockResult.error ?? 'Mock setup failed',
      };
    }

    // Capture screenshot with mocks active
    const result = await captureScreenshot(url, options);

    // Always clean up mocks
    await clearMocks();

    return result;
  } catch (error) {
    // Ensure mocks are cleared even on error
    await clearMocks();

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during mocked capture',
    };
  }
}

/**
 * Stop the headless browser
 *
 * Call this when visual testing is complete to clean up resources.
 */
export async function stopHeadlessBrowser(): Promise<void> {
  await execLens(['headless.stop']);
}
