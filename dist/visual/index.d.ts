/**
 * Visual Testing Module
 *
 * Exports all visual regression testing functionality.
 *
 * E008: Visual Regression Testing
 */
export type { ApiMock, DiffOptions, DiffResult, ScreenshotMetadata, ScreenshotOptions, ScreenshotResult, Viewport, VisualTestResult, } from './types';
export { DEFAULT_OUTPUT_DIR, DEFAULT_THRESHOLD, DEFAULT_TIMEOUT, DEFAULT_VIEWPORTS, } from './types';
export { captureScreenshot, captureWithMocks, stopHeadlessBrowser, } from './screenshot';
export { diffScreenshots, diffScreenshotBatch, screenshotsMatch, } from './diff';
export { formatVisualReport, formatVisualSummary, hasVisualRegressions, } from './report';
//# sourceMappingURL=index.d.ts.map