/**
 * LLM Module
 *
 * ARIA Tasks integration for semantic code review.
 * Uses Azure AI Foundry-hosted Kimi (kimi-2.5).
 */

export {
  // Types
  type ChatMessage,
  type LLMConfig,
  type ChatResponse,
  type LLMErrorCode,
  // Classes
  LLMClient,
  LLMError,
  CostTracker,
  // Factory function
  createLLMClient,
  // Config
  loadLLMConfig,
  DEFAULT_CONFIG,
  TOKEN_COSTS,
} from './provider';

export {
  // Types
  type DiffHunk,
  type ChangedFile,
  type PRDiff,
  type FileContent,
  type ReviewContext,
  type ContextOptions,
  // Functions
  estimateTokens,
  estimateFileTokens,
  parseDiff,
  createPRDiff,
  loadFileContent,
  loadFileContents,
  prioritizeFiles,
  summarizeSpec,
  extractConventions,
  assembleContext,
  formatDiffForLLM,
  formatViolationsForLLM,
  formatFileContentsForLLM,
  formatContextAsPrompt,
} from './context';

export {
  // Types
  type ReviewSeverity,
  type ReviewIssue,
  type LLMReviewResult,
  type ReviewOptions,
  // Functions
  parseReviewResponse,
  runReview,
  formatReviewAsMarkdown,
  reviewIssuesToViolations,
} from './review';

export {
  // Types
  type SpecRequirement,
  type RequirementCheckResult,
  type SpecComplianceResult,
  type SpecComplianceOptions,
  // Functions
  analyzeSpecCompliance,
  parseAcceptanceCriteria,
  formatComplianceAsMarkdown,
} from './spec-compliance';

export {
  // Types
  type LLMCommentOptions,
  type LLMFindings,
  type LLMCommentResult,
  // Constants
  LLM_COMMENT_MARKER,
  // Functions
  formatLLMComment,
  generateGitHubLineLink,
  generateLLMStatusBadge,
} from './pr-comment-formatter';

export {
  // Types
  type ReviewComment,
  type GitHubReview,
  type ChangeRequestOptions,
  // Functions
  generateChangeRequests,
  buildIssueCommentBody,
  buildComplianceCommentBody,
  formatChangeRequestsAsMarkdown,
} from './change-requests';

export {
  // Types
  type FixSuggestion,
  type AutoFixResult,
  type AutoFixOptions,
  // Functions
  generateAutoFixes,
  formatAutoFixesAsMarkdown,
} from './auto-fix';

export {
  // Types
  type ConfidenceThresholds,
  type ScoredIssue,
  type ScoredReview,
  type LLMConfidenceConfig,
  // Constants
  DEFAULT_CONFIDENCE_THRESHOLDS,
  // Functions
  parseConfidenceConfig,
  deriveIssueConfidence,
  scoreIssue,
  scoreReview,
  formatConfidenceLabel,
  formatConfidenceNote,
} from './confidence';

export {
  // Types
  type FeedbackOutcome,
  type FeedbackEntry,
  type FeedbackMetrics,
  type CategoryMetrics,
  type FeedbackFile,
  // Constants
  DEFAULT_FEEDBACK_PATH,
  // Functions
  loadFeedback,
  saveFeedback,
  createEmptyFeedback,
  recordFeedback,
  recordFeedbackBatch,
  computeMetrics,
  formatMetricsAsMarkdown,
} from './feedback';
