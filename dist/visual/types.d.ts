/**
 * Visual Testing Types
 *
 * Type definitions for visual regression testing module.
 * Supports screenshot capture, pixel diffing, and API mocking.
 */
/**
 * Viewport configuration for screenshots
 */
export interface Viewport {
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
    /** Optional viewport name for identification */
    name?: string;
}
/**
 * Options for capturing screenshots
 */
export interface ScreenshotOptions {
    /** Viewport dimensions (default: 1280x720) */
    viewport?: Viewport;
    /** CSS selector to wait for before capture */
    waitFor?: string;
    /** Timeout in ms for waitFor (default: 30000) */
    timeout?: number;
    /** Custom auth headers for authenticated pages */
    authHeaders?: Record<string, string>;
    /** Output directory (default: /tmp/hawky-visual/) */
    outputDir?: string;
    /** Custom filename (auto-generated if not provided) */
    filename?: string;
}
/**
 * Metadata about a captured screenshot
 */
export interface ScreenshotMetadata {
    /** URL that was captured */
    url: string;
    /** Viewport used */
    viewport: Viewport;
    /** Timestamp of capture */
    timestamp: Date;
    /** Time taken to capture in ms */
    captureTimeMs: number;
}
/**
 * Result of a screenshot capture
 */
export interface ScreenshotResult {
    /** Whether capture was successful */
    success: boolean;
    /** Path to saved screenshot file */
    path?: string;
    /** Screenshot as base64 buffer */
    buffer?: string;
    /** Screenshot metadata */
    metadata?: ScreenshotMetadata;
    /** Error message if capture failed */
    error?: string;
}
/**
 * API mock configuration for state mocking
 */
export interface ApiMock {
    /** URL pattern to intercept (supports wildcards) */
    route: string;
    /** Response body to return */
    response: Record<string, unknown> | unknown[];
    /** HTTP status code (default: 200) */
    status?: number;
}
/**
 * Options for screenshot diffing
 */
export interface DiffOptions {
    /** Percentage threshold for acceptable difference (default: 0.1) */
    threshold?: number;
    /** Output path for diff image */
    outputPath?: string;
}
/**
 * Result of a screenshot diff
 */
export interface DiffResult {
    /** Whether diff was successful */
    success: boolean;
    /** Percentage of pixels that differ (0-100) */
    diffPercentage?: number;
    /** Path to diff image (if differences exist) */
    diffImagePath?: string;
    /** Whether images match within threshold */
    matched?: boolean;
    /** Error message if diff failed */
    error?: string;
}
/**
 * Result of a single visual test (route + viewport combination)
 */
export interface VisualTestResult {
    /** Route that was tested */
    route: string;
    /** Viewport used for test */
    viewport: Viewport;
    /** Diff percentage */
    diffPercentage: number;
    /** Whether test passed (diff within threshold) */
    passed: boolean;
    /** Path to baseline screenshot */
    baselinePath: string;
    /** Path to current screenshot */
    currentPath: string;
    /** Path to diff image (if exists) */
    diffImagePath?: string;
    /** Error message if test failed */
    error?: string;
}
/**
 * Default viewport configurations
 */
export declare const DEFAULT_VIEWPORTS: Viewport[];
/**
 * Default temp directory for screenshots
 */
export declare const DEFAULT_OUTPUT_DIR = "/tmp/hawky-visual/";
/**
 * Default timeout for waitFor in ms
 */
export declare const DEFAULT_TIMEOUT = 30000;
/**
 * Default diff threshold (0.1%)
 */
export declare const DEFAULT_THRESHOLD = 0.1;
//# sourceMappingURL=types.d.ts.map