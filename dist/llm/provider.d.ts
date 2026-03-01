/**
 * LLM Provider Integration
 *
 * ARIA Tasks client for Hawky code review.
 * Uses Azure AI Foundry-hosted Kimi (kimi-2.5) for semantic code review.
 *
 * Features:
 * - Rate limiting with token bucket
 * - Retry with exponential backoff
 * - Timeout handling
 * - Cost tracking (optional)
 */
/**
 * Chat message format (OpenAI-compatible)
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
/**
 * LLM configuration
 */
export interface LLMConfig {
    /** API key (from AZURE_AI_FOUNDRY_KEY) */
    apiKey: string;
    /** Azure AI Foundry endpoint URL */
    endpoint: string;
    /** Model name (default: kimi-2.5) */
    model: string;
    /** Temperature (0-1, lower = more deterministic) */
    temperature: number;
    /** Maximum tokens in response */
    maxTokens: number;
    /** Timeout in milliseconds */
    timeoutMs: number;
    /** Enable cost tracking */
    trackCost?: boolean;
    /** Rate limit: max requests per minute */
    rateLimit: number;
}
/**
 * Default configuration for ARIA Tasks
 */
export declare const DEFAULT_CONFIG: Omit<LLMConfig, 'apiKey' | 'endpoint'>;
/**
 * Cost per 1K tokens (approximate, in USD)
 */
export declare const TOKEN_COSTS: {
    input: number;
    output: number;
};
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
    /** Model used */
    model: string;
}
/**
 * LLM client error
 */
export declare class LLMError extends Error {
    readonly code: LLMErrorCode;
    readonly retryable: boolean;
    constructor(message: string, code: LLMErrorCode, retryable?: boolean);
}
/**
 * Error codes
 */
export type LLMErrorCode = 'RATE_LIMITED' | 'TIMEOUT' | 'INVALID_API_KEY' | 'QUOTA_EXCEEDED' | 'MODEL_NOT_FOUND' | 'INVALID_REQUEST' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'MISSING_CONFIG' | 'UNKNOWN';
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
    };
    /**
     * Reset tracking
     */
    reset(): void;
}
/**
 * ARIA Tasks LLM Client
 *
 * Connects to Azure AI Foundry-hosted Kimi for semantic code review.
 */
export declare class LLMClient {
    private readonly config;
    private readonly rateLimiter;
    private readonly costTracker;
    constructor(config: {
        apiKey: string;
        endpoint: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
        timeoutMs?: number;
        trackCost?: boolean;
        rateLimit?: number;
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
 * Create an ARIA Tasks LLM client
 *
 * Uses environment variables:
 * - AZURE_AI_FOUNDRY_ENDPOINT (or ARIA_TASKS_ENDPOINT for local dev)
 * - AZURE_AI_FOUNDRY_KEY (or ARIA_TASKS_API_KEY for local dev)
 */
export declare function createLLMClient(config?: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    trackCost?: boolean;
    rateLimit?: number;
}): LLMClient;
/**
 * Load LLM config from environment
 *
 * Returns null if credentials are not available (LLM review will be skipped).
 */
export declare function loadLLMConfig(hawkyConfig?: {
    llm?: {
        api_key?: string;
        endpoint?: string;
        model?: string;
        temperature?: number;
        max_tokens?: number;
        timeout?: number;
    };
}): LLMConfig | null;
//# sourceMappingURL=provider.d.ts.map