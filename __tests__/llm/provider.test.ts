/**
 * Tests for LLM Provider Integration (ARIA Tasks only)
 */

import {
  LLMClient,
  CostTracker,
  createLLMClient,
  loadLLMConfig,
  DEFAULT_CONFIG,
  TOKEN_COSTS,
  LLMError,
  type ChatMessage,
  type LLMConfig,
} from '../../src/llm/provider';

describe('LLM Provider (ARIA Tasks)', () => {
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
        model: 'kimi-2.5',
      });

      tracker.record({
        content: 'World',
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.006,
        latencyMs: 600,
        model: 'kimi-2.5',
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
        model: 'kimi-2.5',
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
    it('should create client with explicit config', () => {
      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      });

      expect(client).toBeDefined();
    });

    it('should allow custom configuration', () => {
      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
        model: 'kimi-2.5-turbo',
        temperature: 0.7,
        maxTokens: 8192,
        timeoutMs: 120000,
      });

      expect(client).toBeDefined();
    });

    it('should use default model kimi-2.5', () => {
      expect(DEFAULT_CONFIG.model).toBe('kimi-2.5');
    });
  });

  // ============================================================================
  // createLLMClient
  // ============================================================================

  describe('createLLMClient', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should throw when no API key available', () => {
      delete process.env.AZURE_AI_FOUNDRY_KEY;
      delete process.env.ARIA_TASKS_API_KEY;

      expect(() => createLLMClient()).toThrow(LLMError);
    });

    it('should throw when no endpoint available', () => {
      process.env.AZURE_AI_FOUNDRY_KEY = 'test-key';
      delete process.env.AZURE_AI_FOUNDRY_ENDPOINT;
      delete process.env.ARIA_TASKS_ENDPOINT;

      expect(() => createLLMClient()).toThrow(LLMError);
    });

    it('should create client from environment variables', () => {
      process.env.AZURE_AI_FOUNDRY_KEY = 'azure-key';
      process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://test.openai.azure.com';

      const client = createLLMClient();

      expect(client).toBeDefined();
    });

    it('should use ARIA_TASKS_* fallback env vars', () => {
      delete process.env.AZURE_AI_FOUNDRY_KEY;
      delete process.env.AZURE_AI_FOUNDRY_ENDPOINT;
      process.env.ARIA_TASKS_API_KEY = 'aria-key';
      process.env.ARIA_TASKS_ENDPOINT = 'https://aria.openai.azure.com';

      const client = createLLMClient();

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

    it('should return null when no credentials available', () => {
      delete process.env.AZURE_AI_FOUNDRY_KEY;
      delete process.env.AZURE_AI_FOUNDRY_ENDPOINT;
      delete process.env.ARIA_TASKS_API_KEY;
      delete process.env.ARIA_TASKS_ENDPOINT;

      const config = loadLLMConfig({});

      expect(config).toBeNull();
    });

    it('should load config from hawky.yml', () => {
      const config = loadLLMConfig({
        llm: {
          api_key: 'direct-key',
          endpoint: 'https://test.openai.azure.com',
          model: 'kimi-2.5-turbo',
          temperature: 0.5,
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('direct-key');
      expect(config?.endpoint).toBe('https://test.openai.azure.com');
      expect(config?.model).toBe('kimi-2.5-turbo');
      expect(config?.temperature).toBe(0.5);
    });

    it('should load from AZURE_AI_FOUNDRY_* env vars', () => {
      process.env.AZURE_AI_FOUNDRY_KEY = 'azure-key';
      process.env.AZURE_AI_FOUNDRY_ENDPOINT = 'https://test.openai.azure.com';

      const config = loadLLMConfig({});

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('azure-key');
      expect(config?.endpoint).toBe('https://test.openai.azure.com');
      expect(config?.model).toBe('kimi-2.5');
    });

    it('should expand ${VAR} syntax', () => {
      process.env.MY_API_KEY = 'expanded-key';
      process.env.MY_ENDPOINT = 'https://expanded.openai.azure.com';

      const config = loadLLMConfig({
        llm: {
          api_key: '${MY_API_KEY}',
          endpoint: '${MY_ENDPOINT}',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('expanded-key');
      expect(config?.endpoint).toBe('https://expanded.openai.azure.com');
    });

    it('should use default config values', () => {
      const config = loadLLMConfig({
        llm: {
          api_key: 'test-key',
          endpoint: 'https://test.openai.azure.com',
        },
      });

      expect(config).not.toBeNull();
      expect(config?.model).toBe(DEFAULT_CONFIG.model);
      expect(config?.temperature).toBe(DEFAULT_CONFIG.temperature);
      expect(config?.maxTokens).toBe(DEFAULT_CONFIG.maxTokens);
    });
  });

  // ============================================================================
  // Constants
  // ============================================================================

  describe('Constants', () => {
    it('should have kimi-2.5 as default model', () => {
      expect(DEFAULT_CONFIG.model).toBe('kimi-2.5');
    });

    it('should have token costs defined', () => {
      expect(TOKEN_COSTS.input).toBeGreaterThan(0);
      expect(TOKEN_COSTS.output).toBeGreaterThan(0);
    });

    it('should have reasonable defaults', () => {
      expect(DEFAULT_CONFIG.temperature).toBe(0.3);
      expect(DEFAULT_CONFIG.maxTokens).toBe(4096);
      expect(DEFAULT_CONFIG.timeoutMs).toBe(60000);
      expect(DEFAULT_CONFIG.rateLimit).toBe(60);
    });
  });

  // ============================================================================
  // LLMError
  // ============================================================================

  describe('LLMError', () => {
    it('should create error with correct properties', () => {
      const error = new LLMError('Rate limited', 'RATE_LIMITED', true);

      expect(error.message).toBe('Rate limited');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('LLMError');
    });

    it('should default retryable to false', () => {
      const error = new LLMError('Invalid key', 'INVALID_API_KEY');

      expect(error.retryable).toBe(false);
    });

    it('should have MISSING_CONFIG error code', () => {
      const error = new LLMError('Missing config', 'MISSING_CONFIG');

      expect(error.code).toBe('MISSING_CONFIG');
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
                content: 'Hello from Azure Kimi!',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
          },
        }),
      } as Response);

      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      });
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Say hello' },
      ];

      const response = await client.chat(messages);

      expect(response.content).toBe('Hello from Azure Kimi!');
      expect(response.inputTokens).toBe(10);
      expect(response.outputTokens).toBe(5);
      expect(response.model).toBe('kimi-2.5');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should call correct endpoint URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as Response);

      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      });

      await client.chat([{ role: 'user', content: 'Test' }]);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.openai.azure.com/v1/chat/completions',
        expect.any(Object)
      );
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

      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      });
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

      const client = new LLMClient({
        apiKey: 'invalid-key',
        endpoint: 'https://test.openai.azure.com',
      });
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      await expect(client.chat(messages)).rejects.toThrow(LLMError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should track costs when enabled', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 },
        }),
      } as Response);

      const client = new LLMClient({
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
        trackCost: true,
      });

      await client.chat([{ role: 'user', content: 'Test' }]);

      const summary = client.getCostTracker().getSummary();
      expect(summary.totalInputTokens).toBe(1000);
      expect(summary.totalOutputTokens).toBe(500);
      expect(summary.totalCost).toBeGreaterThan(0);
    });

    it('should include Authorization header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as Response);

      const client = new LLMClient({
        apiKey: 'my-secret-key',
        endpoint: 'https://test.openai.azure.com',
      });

      await client.chat([{ role: 'user', content: 'Test' }]);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-secret-key',
          }),
        })
      );
    });
  });
});
