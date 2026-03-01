/**
 * LLM Module
 *
 * ARIA Tasks integration for semantic code review.
 * Uses Azure AI Foundry-hosted Kimi (kimi-2.5).
 */
export { type ChatMessage, type LLMConfig, type ChatResponse, type LLMErrorCode, LLMClient, LLMError, CostTracker, createLLMClient, loadLLMConfig, DEFAULT_CONFIG, TOKEN_COSTS, } from './provider';
export { type DiffHunk, type ChangedFile, type PRDiff, type FileContent, type ReviewContext, type ContextOptions, estimateTokens, estimateFileTokens, parseDiff, createPRDiff, loadFileContent, loadFileContents, prioritizeFiles, summarizeSpec, extractConventions, assembleContext, formatDiffForLLM, formatViolationsForLLM, formatFileContentsForLLM, formatContextAsPrompt, } from './context';
export { type ReviewSeverity, type ReviewIssue, type LLMReviewResult, type ReviewOptions, parseReviewResponse, runReview, formatReviewAsMarkdown, reviewIssuesToViolations, } from './review';
export { type SpecRequirement, type RequirementCheckResult, type SpecComplianceResult, type SpecComplianceOptions, analyzeSpecCompliance, parseAcceptanceCriteria, formatComplianceAsMarkdown, } from './spec-compliance';
export { type LLMCommentOptions, type LLMFindings, type LLMCommentResult, LLM_COMMENT_MARKER, formatLLMComment, generateGitHubLineLink, generateLLMStatusBadge, } from './pr-comment-formatter';
export { type ReviewComment, type GitHubReview, type ChangeRequestOptions, generateChangeRequests, buildIssueCommentBody, buildComplianceCommentBody, formatChangeRequestsAsMarkdown, } from './change-requests';
export { type FixSuggestion, type AutoFixResult, type AutoFixOptions, generateAutoFixes, formatAutoFixesAsMarkdown, } from './auto-fix';
export { type ConfidenceThresholds, type ScoredIssue, type ScoredReview, type LLMConfidenceConfig, DEFAULT_CONFIDENCE_THRESHOLDS, parseConfidenceConfig, deriveIssueConfidence, scoreIssue, scoreReview, formatConfidenceLabel, formatConfidenceNote, } from './confidence';
export { type FeedbackOutcome, type FeedbackEntry, type FeedbackMetrics, type CategoryMetrics, DEFAULT_FEEDBACK_PATH, loadFeedbackEntries, appendFeedbackEntry, appendFeedbackEntries, recordFeedback, recordFeedbackBatch, computeMetrics, loadAndComputeMetrics, formatMetricsAsMarkdown, } from './feedback';
//# sourceMappingURL=index.d.ts.map