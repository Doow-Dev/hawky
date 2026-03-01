/**
 * LLM Module
 *
 * ARIA Tasks integration for semantic code review.
 * Uses Azure AI Foundry-hosted Kimi (kimi-2.5).
 */
export { type ChatMessage, type LLMConfig, type ChatResponse, type LLMErrorCode, LLMClient, LLMError, CostTracker, createLLMClient, loadLLMConfig, DEFAULT_CONFIG, TOKEN_COSTS, } from './provider';
export { type DiffHunk, type ChangedFile, type PRDiff, type FileContent, type ReviewContext, type ContextOptions, estimateTokens, estimateFileTokens, parseDiff, createPRDiff, loadFileContent, loadFileContents, prioritizeFiles, summarizeSpec, extractConventions, assembleContext, formatDiffForLLM, formatViolationsForLLM, formatFileContentsForLLM, formatContextAsPrompt, } from './context';
export { type ReviewSeverity, type ReviewIssue, type LLMReviewResult, type ReviewOptions, parseReviewResponse, runReview, formatReviewAsMarkdown, reviewIssuesToViolations, } from './review';
//# sourceMappingURL=index.d.ts.map