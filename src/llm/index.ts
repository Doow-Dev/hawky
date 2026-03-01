/**
 * LLM Module
 *
 * AI-powered code review using LLMs.
 * Primary provider: ARIA Tasks (Azure-hosted Kimi via Azure AI Foundry)
 * Fallbacks: Kimi (public API), OpenAI, Anthropic
 */

export {
  // Types
  type LLMProvider,
  type ChatMessage,
  type LLMConfig,
  type ChatResponse,
  type LLMErrorCode,
  // Classes
  LLMClient,
  LLMError,
  CostTracker,
  // Factory functions
  createLLMClient,
  createAriaTasksClient,
  createKimiClient,
  createOpenAIClient,
  createAnthropicClient,
  // Config
  loadLLMConfig,
  DEFAULT_CONFIGS,
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
