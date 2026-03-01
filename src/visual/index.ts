/**
 * Visual Testing Module
 *
 * Exports all visual regression testing functionality.
 *
 * E008: Visual Regression Testing
 */

// Types
export type {
  ApiMock,
  DiffOptions,
  DiffResult,
  ScreenshotMetadata,
  ScreenshotOptions,
  ScreenshotResult,
  Viewport,
  VisualTestResult,
} from './types';

export {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_THRESHOLD,
  DEFAULT_TIMEOUT,
  DEFAULT_VIEWPORTS,
} from './types';

// Screenshot capture
export {
  captureScreenshot,
  captureWithMocks,
  stopHeadlessBrowser,
} from './screenshot';

// Diff comparison
export {
  diffScreenshots,
  diffScreenshotBatch,
  screenshotsMatch,
} from './diff';

// Report generation
export {
  formatVisualReport,
  formatVisualSummary,
  hasVisualRegressions,
} from './report';
