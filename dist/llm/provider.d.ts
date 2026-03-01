/**
 * LLM Provider Integration
 *
 * Multi-provider LLM client with Kimi as the primary provider.
 * Supports OpenAI and Anthropic as fallbacks.
 *
 * Features:
 * - Rate limiting with token bucket
 * - Retry with exponential backoff
 * - Timeout handling
 * - Cost tracking (optional)
 */
/**
 * Supported LLM providers
 */
export type LLMProvider = 'kimi' | 'openai' | 'anthropic';
/**
 * Chat message format (OpenAI-compatible)
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
/**
 * LLM configuration from .hawky.yml
 */
export interface LLMConfig {
    /** Provider to use */
    provider: LLMProvider;
    /** API key (usually from environment variable) */
    apiKey: string;
    /** Model name */
    model: string;
    /** Temperature (0-1, lower = more deterministic) */
    temperature: number;
    /** Maximum tokens in response */
    maxTokens?: number;
    /** Timeout in milliseconds */
    timeoutMs: number;
    /** Enable cost tracking */
    trackCost?: boolean;
    /** Rate limit: max requests per minute */
    rateLimit?: number;
}
/**
 * Default configurations per provider
 */
export declare const DEFAULT_CONFIGS: Record<LLMProvider, Partial<LLMConfig>>;
/**
 * Cost per 1K tokens (approximate, in USD)
 */
export declare const TOKEN_COSTS: Record<LLMProvider, {
    input: number;
    output: number;
}>;
/**
 * Response from chat completion
 */
export interface ChatResponse {
    /** Generated content */
    content: string;
    /** Number of input tokens */
    inputTokens: number;
    /** Number of output tokens */
    outputTokens: number;
    /** Estimated cost in USD */
    cost: number;
    /** Response latency in ms */
    latencyMs: number;
    /** Provider used */
    provider: LLMProvider;
    /** Model used */
    model: string;
}
/**
 * LLM client error
 */
export declare class LLMError extends Error {
    readonly code: LLMErrorCode;
    readonly provider: LLMProvider;
    readonly retryable: boolean;
    constructor(message: string, code: LLMErrorCode, provider: LLMProvider, retryable?: boolean);
}
/**
 * Error codes
 */
export type LLMErrorCode = 'RATE_LIMITED' | 'TIMEOUT' | 'INVALID_API_KEY' | 'QUOTA_EXCEEDED' | 'MODEL_NOT_FOUND' | 'INVALID_REQUEST' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN';
/**
 * Tracks LLM usage and costs
 */
export declare class CostTracker {
    private totalInputTokens;
    private totalOutputTokens;
    private totalCost;
    private requestCount;
    /**
     * Record a completed request
     */
    record(response: ChatResponse): void;
    /**
     * Get usage summary
     */
    getSummary(): {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        totalCost: number;
        requestCount: number;
        averageLatencyMs: number;
    };
    /**
     * Reset tracking
     */
    reset(): void;
}
/**
 * LLM Client with multi-provider support
 */
export declare class LLMClient {
    private readonly config;
    private readonly rateLimiter;
    private readonly costTracker;
    constructor(config: Partial<LLMConfig> & {
        apiKey: string;
    });
    /**
     * Get the cost tracker
     */
    getCostTracker(): CostTracker;
    /**
     * Send a chat completion request
     */
    chat(messages: ChatMessage[], options?: {
        maxRetries?: number;
        retryDelayMs?: number;
    }): Promise<ChatResponse>;
    /**
     * Make the actual API request
     */
    private makeRequest;
    /**
     * Build request body for the provider
     */
    private buildRequestBody;
    /**
     * Get headers for the request
     */
    private getHeaders;
    /**
     * Parse error response
     */
    private parseErrorResponse;
    /**
     * Parse successful response
     */
    private parseResponse;
    /**
     * Calculate cost for tokens
     */
    private calculateCost;
}
/**
 * Create an LLM client from config
 */
export declare function createLLMClient(config: Partial<LLMConfig> & {
    apiKey: string;
}): LLMClient;
/**
 * Create a Kimi client
 */
export declare function createKimiClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient;
/**
 * Create an OpenAI client
 */
export declare function createOpenAIClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient;
/**
 * Create an Anthropic client
 */
export declare function createAnthropicClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient;
/**
 * Load LLM config from environment and .hawky.yml
 */
export declare function loadLLMConfig(hawkyConfig?: {
    llm?: {
        provider?: LLMProvider;
        api_key?: string;
        model?: string;
        temperature?: number;
        max_tokens?: number;
        timeout?: number;
    };
}): LLMConfig | null;
//# sourceMappingURL=provider.d.ts.map