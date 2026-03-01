/**
 * LLM Module
 *
 * AI-powered code review using LLMs (Kimi primary, OpenAI/Anthropic fallback).
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
  createKimiClient,
  createOpenAIClient,
  createAnthropicClient,
  // Config
  loadLLMConfig,
  DEFAULT_CONFIGS,
  TOKEN_COSTS,
} from './provider';
