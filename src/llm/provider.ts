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

// ============================================================================
// Types
// ============================================================================

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
export const DEFAULT_CONFIGS: Record<LLMProvider, Partial<LLMConfig>> = {
  kimi: {
    model: 'moonshot-v1-8k',
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 60000,
    rateLimit: 60, // 60 requests per minute
  },
  openai: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 60000,
    rateLimit: 60,
  },
  anthropic: {
    model: 'claude-3-haiku-20240307',
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 60000,
    rateLimit: 60,
  },
};

/**
 * Cost per 1K tokens (approximate, in USD)
 */
export const TOKEN_COSTS: Record<
  LLMProvider,
  { input: number; output: number }
> = {
  kimi: { input: 0.012, output: 0.012 }, // Kimi pricing
  openai: { input: 0.01, output: 0.03 }, // GPT-4 Turbo
  anthropic: { input: 0.00025, output: 0.00125 }, // Claude 3 Haiku
};

/**
 * API endpoints per provider
 */
const API_ENDPOINTS: Record<LLMProvider, string> = {
  kimi: 'https://api.moonshot.cn/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
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

  /** Provider used */
  provider: LLMProvider;

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
    public readonly provider: LLMProvider,
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
    averageLatencyMs: number;
  } {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageLatencyMs: 0, // Would need to track this
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
 * LLM Client with multi-provider support
 */
export class LLMClient {
  private readonly config: LLMConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly costTracker: CostTracker;

  constructor(config: Partial<LLMConfig> & { apiKey: string }) {
    const provider = config.provider || 'kimi';
    const defaults = DEFAULT_CONFIGS[provider];

    const maxTokens = config.maxTokens ?? defaults.maxTokens ?? 4096;
    const rateLimit = config.rateLimit ?? defaults.rateLimit ?? 60;

    this.config = {
      provider,
      apiKey: config.apiKey,
      model: config.model || defaults.model || 'moonshot-v1-8k',
      temperature: config.temperature ?? defaults.temperature ?? 0.3,
      maxTokens,
      timeoutMs: config.timeoutMs ?? defaults.timeoutMs ?? 60000,
      trackCost: config.trackCost ?? false,
      rateLimit,
    };

    this.rateLimiter = new RateLimiter(rateLimit);
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
    }
  ): Promise<ChatResponse> {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelay = options?.retryDelayMs ?? 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait for rate limiter
        await this.rateLimiter.acquire();

        // Make the request
        const response = await this.makeRequest(messages);

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
  private async makeRequest(messages: ChatMessage[]): Promise<ChatResponse> {
    const startTime = Date.now();
    const endpoint = API_ENDPOINTS[this.config.provider];

    // Build request body based on provider
    const body = this.buildRequestBody(messages);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
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
          throw new LLMError(
            'Request timed out',
            'TIMEOUT',
            this.config.provider,
            true
          );
        }

        throw new LLMError(
          `Network error: ${error.message}`,
          'NETWORK_ERROR',
          this.config.provider,
          true
        );
      }

      throw new LLMError(
        'Unknown error',
        'UNKNOWN',
        this.config.provider,
        false
      );
    }
  }

  /**
   * Build request body for the provider
   */
  private buildRequestBody(
    messages: ChatMessage[]
  ): Record<string, unknown> {
    if (this.config.provider === 'anthropic') {
      // Anthropic has a different format
      const systemMessages = messages.filter((m) => m.role === 'system');
      const otherMessages = messages.filter((m) => m.role !== 'system');

      return {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system:
          systemMessages.length > 0
            ? systemMessages.map((m) => m.content).join('\n')
            : undefined,
        messages: otherMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      };
    }

    // OpenAI-compatible format (Kimi, OpenAI)
    return {
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };
  }

  /**
   * Get headers for the request
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.provider === 'anthropic') {
      headers['x-api-key'] = this.config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
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

    return new LLMError(
      `API error (${status}): ${body}`,
      code,
      this.config.provider,
      retryable
    );
  }

  /**
   * Parse successful response
   */
  private parseResponse(
    data: Record<string, unknown>,
    startTime: number
  ): ChatResponse {
    const latencyMs = Date.now() - startTime;

    if (this.config.provider === 'anthropic') {
      // Anthropic response format
      const contentArr = data['content'] as Array<{ text: string }> | undefined;
      const content = contentArr?.[0]?.text || '';
      const usage = data['usage'] as { input_tokens: number; output_tokens: number } | undefined;
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;

      return {
        content,
        inputTokens,
        outputTokens,
        cost: this.calculateCost(inputTokens, outputTokens),
        latencyMs,
        provider: this.config.provider,
        model: this.config.model,
      };
    }

    // OpenAI-compatible format (Kimi, OpenAI)
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
      provider: this.config.provider,
      model: this.config.model,
    };
  }

  /**
   * Calculate cost for tokens
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const costs = TOKEN_COSTS[this.config.provider];
    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    return inputCost + outputCost;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an LLM client from config
 */
export function createLLMClient(config: Partial<LLMConfig> & { apiKey: string }): LLMClient {
  return new LLMClient(config);
}

/**
 * Create a Kimi client
 */
export function createKimiClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient {
  return new LLMClient({
    ...config,
    provider: 'kimi',
    apiKey,
  });
}

/**
 * Create an OpenAI client
 */
export function createOpenAIClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient {
  return new LLMClient({
    ...config,
    provider: 'openai',
    apiKey,
  });
}

/**
 * Create an Anthropic client
 */
export function createAnthropicClient(apiKey: string, config?: Partial<LLMConfig>): LLMClient {
  return new LLMClient({
    ...config,
    provider: 'anthropic',
    apiKey,
  });
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load LLM config from environment and .hawky.yml
 */
export function loadLLMConfig(
  hawkyConfig?: {
    llm?: {
      provider?: LLMProvider;
      api_key?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      timeout?: number;
    };
  }
): LLMConfig | null {
  const llmConfig = hawkyConfig?.llm;
  const provider = llmConfig?.provider || 'kimi';

  // Get API key from config or environment
  let apiKey = llmConfig?.api_key;

  if (!apiKey) {
    // Try environment variables
    switch (provider) {
      case 'kimi':
        apiKey = process.env['KIMI_API_KEY'] || process.env['MOONSHOT_API_KEY'];
        break;
      case 'openai':
        apiKey = process.env['OPENAI_API_KEY'];
        break;
      case 'anthropic':
        apiKey = process.env['ANTHROPIC_API_KEY'];
        break;
    }
  }

  // Handle ${VAR} syntax
  if (apiKey && apiKey.startsWith('${') && apiKey.endsWith('}')) {
    const varName = apiKey.slice(2, -1);
    apiKey = process.env[varName];
  }

  if (!apiKey) {
    return null;
  }

  const defaults = DEFAULT_CONFIGS[provider];
  const maxTokens = llmConfig?.max_tokens ?? defaults.maxTokens ?? 4096;
  const rateLimit = defaults.rateLimit ?? 60;

  return {
    provider,
    apiKey,
    model: llmConfig?.model || defaults.model || 'moonshot-v1-8k',
    temperature: llmConfig?.temperature ?? defaults.temperature ?? 0.3,
    maxTokens,
    timeoutMs: (llmConfig?.timeout ?? 60) * 1000,
    rateLimit,
  };
}
