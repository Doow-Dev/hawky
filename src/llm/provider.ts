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

// ============================================================================
// Types
// ============================================================================

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
export const DEFAULT_CONFIG: Omit<LLMConfig, 'apiKey' | 'endpoint'> = {
  model: 'kimi-2.5',
  temperature: 0.3,
  maxTokens: 4096,
  timeoutMs: 60000,
  rateLimit: 60,
};

/**
 * Cost per 1K tokens (approximate, in USD)
 */
export const TOKEN_COSTS = {
  input: 0.012,
  output: 0.012,
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
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Error codes
 */
export type LLMErrorCode =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INVALID_API_KEY'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'MISSING_CONFIG'
  | 'UNKNOWN';

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Token bucket rate limiter
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerMinute / 60000; // per ms
  }

  /**
   * Wait until a token is available
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time
    const tokensNeeded = 1 - this.tokens;
    const waitMs = Math.ceil(tokensNeeded / this.refillRate);

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

// ============================================================================
// Cost Tracker
// ============================================================================

/**
 * Tracks LLM usage and costs
 */
export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;
  private requestCount = 0;

  /**
   * Record a completed request
   */
  record(response: ChatResponse): void {
    this.totalInputTokens += response.inputTokens;
    this.totalOutputTokens += response.outputTokens;
    this.totalCost += response.cost;
    this.requestCount += 1;
  }

  /**
   * Get usage summary
   */
  getSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    requestCount: number;
  } {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      totalCost: this.totalCost,
      requestCount: this.requestCount,
    };
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCost = 0;
    this.requestCount = 0;
  }
}

// ============================================================================
// LLM Client
// ============================================================================

/**
 * ARIA Tasks LLM Client
 *
 * Connects to Azure AI Foundry-hosted Kimi for semantic code review.
 */
export class LLMClient {
  private readonly config: LLMConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly costTracker: CostTracker;

  constructor(config: {
    apiKey: string;
    endpoint: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    trackCost?: boolean;
    rateLimit?: number;
  }) {
    this.config = {
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model ?? DEFAULT_CONFIG.model,
      temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
      maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      timeoutMs: config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      trackCost: config.trackCost ?? false,
      rateLimit: config.rateLimit ?? DEFAULT_CONFIG.rateLimit,
    };

    this.rateLimiter = new RateLimiter(this.config.rateLimit);
    this.costTracker = new CostTracker();
  }

  /**
   * Get the cost tracker
   */
  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  /**
   * Send a chat completion request
   */
  async chat(
    messages: ChatMessage[],
    options?: {
      maxRetries?: number;
      retryDelayMs?: number;
      /** Override temperature for this request (0 = deterministic) */
      temperature?: number;
    }
  ): Promise<ChatResponse> {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelay = options?.retryDelayMs ?? 1000;
    const temperature = options?.temperature;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait for rate limiter
        await this.rateLimiter.acquire();

        // Make the request
        const response = await this.makeRequest(messages, temperature);

        // Track cost if enabled
        if (this.config.trackCost) {
          this.costTracker.record(response);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if retryable
        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        // Last attempt, throw
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Unknown error');
  }

  /**
   * Make the actual API request
   */
  private async makeRequest(messages: ChatMessage[], temperatureOverride?: number): Promise<ChatResponse> {
    const startTime = Date.now();

    // Build endpoint URL
    const endpoint = this.config.endpoint.endsWith('/')
      ? `${this.config.endpoint}v1/chat/completions`
      : `${this.config.endpoint}/v1/chat/completions`;

    // Build request body (OpenAI-compatible format)
    const body = {
      model: this.config.model,
      messages,
      temperature: temperatureOverride ?? this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw this.parseErrorResponse(response.status, errorBody);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return this.parseResponse(data, startTime);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LLMError('Request timed out', 'TIMEOUT', true);
        }

        throw new LLMError(
          `Network error: ${error.message}`,
          'NETWORK_ERROR',
          true
        );
      }

      throw new LLMError('Unknown error', 'UNKNOWN', false);
    }
  }

  /**
   * Parse error response
   */
  private parseErrorResponse(status: number, body: string): LLMError {
    let code: LLMErrorCode = 'UNKNOWN';
    let retryable = false;

    switch (status) {
      case 401:
        code = 'INVALID_API_KEY';
        break;
      case 403:
        code = 'QUOTA_EXCEEDED';
        break;
      case 404:
        code = 'MODEL_NOT_FOUND';
        break;
      case 429:
        code = 'RATE_LIMITED';
        retryable = true;
        break;
      case 400:
        code = 'INVALID_REQUEST';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = 'SERVER_ERROR';
        retryable = true;
        break;
    }

    return new LLMError(`API error (${status}): ${body}`, code, retryable);
  }

  /**
   * Parse successful response
   */
  private parseResponse(
    data: Record<string, unknown>,
    startTime: number
  ): ChatResponse {
    const latencyMs = Date.now() - startTime;

    // OpenAI-compatible format
    const choices = data['choices'] as Array<{
      message: { content: string };
    }> | undefined;
    const content = choices?.[0]?.message?.content || '';
    const usage = data['usage'] as {
      prompt_tokens: number;
      completion_tokens: number;
    } | undefined;
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;

    return {
      content,
      inputTokens,
      outputTokens,
      cost: this.calculateCost(inputTokens, outputTokens),
      latencyMs,
      model: this.config.model,
    };
  }

  /**
   * Calculate cost for tokens
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1000) * TOKEN_COSTS.input;
    const outputCost = (outputTokens / 1000) * TOKEN_COSTS.output;
    return inputCost + outputCost;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an ARIA Tasks LLM client
 *
 * Uses environment variables:
 * - AZURE_AI_FOUNDRY_ENDPOINT (or ARIA_TASKS_ENDPOINT for local dev)
 * - AZURE_AI_FOUNDRY_KEY (or ARIA_TASKS_API_KEY for local dev)
 */
export function createLLMClient(config?: {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  trackCost?: boolean;
  rateLimit?: number;
}): LLMClient {
  const apiKey = config?.apiKey ||
                 process.env['AZURE_AI_FOUNDRY_KEY'] ||
                 process.env['ARIA_TASKS_API_KEY'];

  const endpoint = config?.endpoint ||
                   process.env['AZURE_AI_FOUNDRY_ENDPOINT'] ||
                   process.env['ARIA_TASKS_ENDPOINT'];

  if (!apiKey) {
    throw new LLMError(
      'Missing API key. Set AZURE_AI_FOUNDRY_KEY environment variable.',
      'MISSING_CONFIG',
      false
    );
  }

  if (!endpoint) {
    throw new LLMError(
      'Missing endpoint. Set AZURE_AI_FOUNDRY_ENDPOINT environment variable.',
      'MISSING_CONFIG',
      false
    );
  }

  const clientConfig: {
    apiKey: string;
    endpoint: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    trackCost?: boolean;
    rateLimit?: number;
  } = { apiKey, endpoint };

  if (config?.model !== undefined) clientConfig.model = config.model;
  if (config?.temperature !== undefined) clientConfig.temperature = config.temperature;
  if (config?.maxTokens !== undefined) clientConfig.maxTokens = config.maxTokens;
  if (config?.timeoutMs !== undefined) clientConfig.timeoutMs = config.timeoutMs;
  if (config?.trackCost !== undefined) clientConfig.trackCost = config.trackCost;
  if (config?.rateLimit !== undefined) clientConfig.rateLimit = config.rateLimit;

  return new LLMClient(clientConfig);
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load LLM config from environment
 *
 * Returns null if credentials are not available (LLM review will be skipped).
 */
export function loadLLMConfig(
  hawkyConfig?: {
    llm?: {
      api_key?: string;
      endpoint?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      timeout?: number;
    };
  }
): LLMConfig | null {
  const llmConfig = hawkyConfig?.llm;

  // Get API key from config or environment
  let apiKey = llmConfig?.api_key;
  let endpoint = llmConfig?.endpoint;

  if (!apiKey) {
    apiKey = process.env['AZURE_AI_FOUNDRY_KEY'] ||
             process.env['ARIA_TASKS_API_KEY'];
  }

  if (!endpoint) {
    endpoint = process.env['AZURE_AI_FOUNDRY_ENDPOINT'] ||
               process.env['ARIA_TASKS_ENDPOINT'];
  }

  // Handle ${VAR} syntax for API key
  if (apiKey && apiKey.startsWith('${') && apiKey.endsWith('}')) {
    const varName = apiKey.slice(2, -1);
    apiKey = process.env[varName];
  }

  // Handle ${VAR} syntax for endpoint
  if (endpoint && endpoint.startsWith('${') && endpoint.endsWith('}')) {
    const varName = endpoint.slice(2, -1);
    endpoint = process.env[varName];
  }

  // If no credentials, return null (LLM review will be skipped)
  if (!apiKey || !endpoint) {
    return null;
  }

  return {
    apiKey,
    endpoint,
    model: llmConfig?.model ?? DEFAULT_CONFIG.model,
    temperature: llmConfig?.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: llmConfig?.max_tokens ?? DEFAULT_CONFIG.maxTokens,
    timeoutMs: (llmConfig?.timeout ?? 60) * 1000,
    rateLimit: DEFAULT_CONFIG.rateLimit,
  };
}
