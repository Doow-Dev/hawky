/**
 * LLM Module
 *
 * AI-powered code review using LLMs.
 * Primary provider: ARIA Tasks (Azure-hosted Kimi via Azure AI Foundry)
 * Fallbacks: Kimi (public API), OpenAI, Anthropic
 */
export { type LLMProvider, type ChatMessage, type LLMConfig, type ChatResponse, type LLMErrorCode, LLMClient, LLMError, CostTracker, createLLMClient, createAriaTasksClient, createKimiClient, createOpenAIClient, createAnthropicClient, loadLLMConfig, DEFAULT_CONFIGS, TOKEN_COSTS, } from './provider';
export { type DiffHunk, type ChangedFile, type PRDiff, type FileContent, type ReviewContext, type ContextOptions, estimateTokens, estimateFileTokens, parseDiff, createPRDiff, loadFileContent, loadFileContents, prioritizeFiles, summarizeSpec, extractConventions, assembleContext, formatDiffForLLM, formatViolationsForLLM, formatFileContentsForLLM, formatContextAsPrompt, } from './context';
export { type ReviewSeverity, type ReviewIssue, type LLMReviewResult, type ReviewOptions, parseReviewResponse, runReview, formatReviewAsMarkdown, reviewIssuesToViolations, } from './review';
//# sourceMappingURL=index.d.ts.map