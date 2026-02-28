/**
 * Report Module
 *
 * Exports report types and reporters for Hawky.
 */

// Types
export type {
  GateSummary,
  ReportData,
  ReportConfig,
} from './types';

export {
  DEFAULT_REPORT_CONFIG,
  GATE_DISPLAY_NAMES,
  gateResultToSummary,
} from './types';

// PR Comment Reporter
export {
  generatePRComment,
  postPRComment,
  HAWKY_COMMENT_MARKER,
} from './pr-comment';

// Step Summary Reporter
export {
  writeStepSummary,
  generateStepSummaryMarkdown,
} from './step-summary';
