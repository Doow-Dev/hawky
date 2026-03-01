/**
 * Visual Screenshot Module
 *
 * Captures screenshots using lens-cli for visual regression testing.
 * Supports viewport configuration, wait conditions, and API mocking.
 *
 * S066: lens-cli Screenshot Integration
 * S069: State Mocking
 */
import type { ApiMock, ScreenshotOptions, ScreenshotResult } from './types';
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
export declare function captureScreenshot(url: string, options?: ScreenshotOptions): Promise<ScreenshotResult>;
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
export declare function captureWithMocks(url: string, mocks: ApiMock[], options?: ScreenshotOptions): Promise<ScreenshotResult>;
/**
 * Stop the headless browser
 *
 * Call this when visual testing is complete to clean up resources.
 */
export declare function stopHeadlessBrowser(): Promise<void>;
//# sourceMappingURL=screenshot.d.ts.map