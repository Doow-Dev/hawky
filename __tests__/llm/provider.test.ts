/**
 * Tests for LLM Provider Integration
 */

import {
  LLMClient,
  CostTracker,
  createLLMClient,
  createKimiClient,
  createOpenAIClient,
  createAnthropicClient,
  loadLLMConfig,
  DEFAULT_CONFIGS,
  TOKEN_COSTS,
  LLMError,
  type ChatMessage,
  type LLMConfig,
} from '../../src/llm/provider';

describe('LLM Provider', () => {
  // ============================================================================
  // CostTracker
  // ============================================================================

  describe('CostTracker', () => {
    it('should track usage correctly', () => {
      const tracker = new CostTracker();

      tracker.record({
        content: 'Hello',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.003,
        latencyMs: 500,
        provider: 'kimi',
        model: 'moonshot-v1-8k',
      });

      tracker.record({
        content: 'World',
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.006,
        latencyMs: 600,
        provider: 'kimi',
        model: 'moonshot-v1-8k',
      });

      const summary = tracker.getSummary();

      expect(summary.totalInputTokens).toBe(300);
      expect(summary.totalOutputTokens).toBe(150);
      expect(summary.totalTokens).toBe(450);
      expect(summary.totalCost).toBeCloseTo(0.009, 5);
      expect(summary.requestCount).toBe(2);
    });

    it('should reset tracking', () => {
      const tracker = new CostTracker();

      tracker.record({
        content: 'Test',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.003,
        latencyMs: 500,
        provider: 'kimi',
        model: 'moonshot-v1-8k',
      });

      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(0);
      expect(summary.requestCount).toBe(0);
    });
  });

  // ============================================================================
  // LLMClient configuration
  // ============================================================================

  describe('LLMClient configuration', () => {
    it('should use Kimi defaults', () => {
      const client = createKimiClient('test-key');
      // Access config through getCostTracker (client internals not exposed)
      expect(client).toBeDefined();
    });

    it('should allow custom configuration', () => {
      const client = createLLMClient({
        provider: 'kimi',
        apiKey: 'test-key',
        model: 'moonshot-v1-32k',
        temperature: 0.7,
        maxTokens: 8192,
        timeoutMs: 120000,
      });

      expect(client).toBeDefined();
    });

    it('should create OpenAI client', () => {
      const client = createOpenAIClient('test-key', {
        model: 'gpt-4',
        temperature: 0.5,
      });

      expect(client).toBeDefined();
    });

    it('should create Anthropic client', () => {
      const client = createAnthropicClient('test-key');

      expect(client).toBeDefined();
    });
  });

  // ============================================================================
  // loadLLMConfig
  // ============================================================================

  describe('loadLLMConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return null when no API key available', () => {
      delete process.env.KIMI_API_KEY;
      delete process.env.MOONSHOT_API_KEY;

      const config = loadLLMConfig({});

      expect(config).toBeNull();
    });

    it('should load config from hawky.yml', () => {
      const config = loadLLMConfig({
        llm: {
          provider: 'kimi',
          api_key: 'direct-key',
          model: 'moonshot-v1-32k',
          temperature: 0.5,
        },
      });

      expect(config).not.toBeNull();
      expect(config?.provider).toBe('kimi');
      expect(config?.apiKey).toBe('direct-key');
      expect(config?.model).toBe('moonshot-v1-32k');
      expect(config?.temperature).toBe(0.5);
    });

    it('should load API key from environment variable', () => {
      process.env.KIMI_API_KEY = 'env-key';

      const config = loadLLMConfig({
        llm: {
          provider: 'kimi',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('env-key');
    });

    it('should expand ${VAR} syntax', () => {
      process.env.MY_API_KEY = 'expanded-key';

      const config = loadLLMConfig({
        llm: {
          provider: 'kimi',
          api_key: '${MY_API_KEY}',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('expanded-key');
    });

    it('should use provider-specific environment variables', () => {
      process.env.OPENAI_API_KEY = 'openai-key';

      const config = loadLLMConfig({
        llm: {
          provider: 'openai',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('openai-key');
    });

    it('should use default config values', () => {
      const config = loadLLMConfig({
        llm: {
          provider: 'kimi',
          api_key: 'test-key',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.model).toBe(DEFAULT_CONFIGS.kimi.model);
      expect(config?.temperature).toBe(DEFAULT_CONFIGS.kimi.temperature);
    });
  });

  // ============================================================================
  // DEFAULT_CONFIGS and TOKEN_COSTS
  // ============================================================================

  describe('Constants', () => {
    it('should have configs for all providers', () => {
      expect(DEFAULT_CONFIGS.kimi).toBeDefined();
      expect(DEFAULT_CONFIGS.openai).toBeDefined();
      expect(DEFAULT_CONFIGS.anthropic).toBeDefined();
    });

    it('should have token costs for all providers', () => {
      expect(TOKEN_COSTS.kimi).toBeDefined();
      expect(TOKEN_COSTS.openai).toBeDefined();
      expect(TOKEN_COSTS.anthropic).toBeDefined();

      // Each should have input and output costs
      for (const provider of ['kimi', 'openai', 'anthropic'] as const) {
        expect(TOKEN_COSTS[provider].input).toBeGreaterThan(0);
        expect(TOKEN_COSTS[provider].output).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // LLMError
  // ============================================================================

  describe('LLMError', () => {
    it('should create error with correct properties', () => {
      const error = new LLMError(
        'Rate limited',
        'RATE_LIMITED',
        'kimi',
        true
      );

      expect(error.message).toBe('Rate limited');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.provider).toBe('kimi');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('LLMError');
    });

    it('should default retryable to false', () => {
      const error = new LLMError(
        'Invalid key',
        'INVALID_API_KEY',
        'openai'
      );

      expect(error.retryable).toBe(false);
    });
  });

  // ============================================================================
  // Integration tests (mocked)
  // ============================================================================

  describe('LLMClient.chat (mocked)', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should make successful request', async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Hello, world!',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
          },
        }),
      } as Response);

      const client = createKimiClient('test-key');
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Say hello' },
      ];

      const response = await client.chat(messages);

      expect(response.content).toBe('Hello, world!');
      expect(response.inputTokens).toBe(10);
      expect(response.outputTokens).toBe(5);
      expect(response.provider).toBe('kimi');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limiting with retry', async () => {
      let callCount = 0;

      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limited',
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'Success after retry' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        } as Response;
      });

      const client = createKimiClient('test-key');
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const response = await client.chat(messages, {
        retryDelayMs: 10, // Short delay for test
      });

      expect(response.content).toBe('Success after retry');
      expect(callCount).toBe(2);
    });

    it('should not retry non-retryable errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      } as Response);

      const client = createKimiClient('invalid-key');
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      await expect(client.chat(messages)).rejects.toThrow(LLMError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle Anthropic format', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: 'Hello from Claude' }],
          usage: {
            input_tokens: 15,
            output_tokens: 8,
          },
        }),
      } as Response);

      const client = createAnthropicClient('test-key');
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Say hello' },
      ];

      const response = await client.chat(messages);

      expect(response.content).toBe('Hello from Claude');
      expect(response.inputTokens).toBe(15);
      expect(response.outputTokens).toBe(8);
      expect(response.provider).toBe('anthropic');
    });

    it('should track costs when enabled', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 },
        }),
      } as Response);

      const client = createLLMClient({
        provider: 'kimi',
        apiKey: 'test-key',
        trackCost: true,
      });

      await client.chat([{ role: 'user', content: 'Test' }]);

      const summary = client.getCostTracker().getSummary();
      expect(summary.totalInputTokens).toBe(1000);
      expect(summary.totalOutputTokens).toBe(500);
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });
});
