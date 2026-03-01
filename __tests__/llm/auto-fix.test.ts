/**
 * Tests for Auto-Fix Suggestions (S078)
 */

import {
  generateAutoFixes,
  formatAutoFixesAsMarkdown,
  type AutoFixOptions,
  type FixSuggestion,
} from '../../src/llm/auto-fix';
import { LLMClient } from '../../src/llm/provider';
import type { ReviewIssue } from '../../src/llm/review';

// ============================================================================
// Helpers
// ============================================================================

function createIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    file: 'src/auth.ts',
    line: 10,
    severity: 'warning',
    message: 'No issue description',
    ...overrides,
  };
}

function createOptions(overrides: Partial<AutoFixOptions> = {}): AutoFixOptions {
  return { useLLM: false, ...overrides };
}

// ============================================================================
// Pattern-Based Fixes
// ============================================================================

describe('generateAutoFixes — pattern-based', () => {
  it('should generate fix for console.log issue', async () => {
    const issues = [
      createIssue({ message: 'Remove console.log statement', category: 'code-quality' }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.source).toBe('pattern');
    expect(result.fixes[0]?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.unfixableIssues).toHaveLength(0);
  });

  it('should generate fix for console statement issue', async () => {
    const issues = [
      createIssue({ message: 'Unexpected console statement found in production code' }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.description).toContain('console.log');
  });

  it('should generate fix for missing await', async () => {
    const issues = [
      createIssue({
        message: 'Missing await on async call',
        suggestion: 'fetchUser(id)',
        category: 'code-quality',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.replacement).toContain('await');
    expect(result.fixes[0]?.replacement).toContain('fetchUser(id)');
  });

  it('should not fix missing await without suggestion', async () => {
    const issues = [
      createIssue({ message: 'Promise not awaited', suggestion: undefined }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    // No suggestion to build from — should be unfixable
    expect(result.unfixableIssues).toHaveLength(1);
  });

  it('should generate fix for as any type assertion', async () => {
    const issues = [
      createIssue({
        message: 'Avoid using "as any" — use proper types',
        category: 'type-safety',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.original).toBe('as any');
  });

  it('should generate fix for hardcoded secret', async () => {
    const issues = [
      createIssue({
        message: 'Hardcoded secret found in source code',
        category: 'security',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.replacement).toContain('process.env');
  });

  it('should generate fix for null/undefined check with suggestion', async () => {
    const issues = [
      createIssue({
        message: 'Possibly undefined — use optional chaining',
        suggestion: 'user?.name',
        category: 'type-safety',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.replacement).toBe('user?.name');
  });

  it('should generate fix for deprecated API with suggestion', async () => {
    const issues = [
      createIssue({
        message: 'Using deprecated method, use newMethod() instead',
        suggestion: 'newMethod()',
        category: 'code-quality',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.replacement).toBe('newMethod()');
  });

  it('should add unfixable issue when no pattern matches', async () => {
    const issues = [
      createIssue({
        message: 'Complex business logic violation that requires human review',
        category: 'other',
      }),
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.fixes).toHaveLength(0);
    expect(result.unfixableIssues).toHaveLength(1);
  });

  it('should filter fixes below minConfidence', async () => {
    const issues = [
      createIssue({ message: 'Avoid using "as any"', category: 'type-safety' }),
    ];

    // as any pattern has confidence 0.6 — should be filtered at 0.8
    const result = await generateAutoFixes(issues, createOptions({ minConfidence: 0.8 }));

    expect(result.fixes).toHaveLength(0);
    expect(result.unfixableIssues).toHaveLength(1);
  });

  it('should sort fixes by confidence descending', async () => {
    const issues = [
      createIssue({ message: 'Avoid using "as any"', category: 'type-safety' }), // 0.6
      createIssue({ file: 'src/other.ts', message: 'console.log found', category: 'code-quality' }), // 0.9
    ];

    const result = await generateAutoFixes(issues, createOptions());

    // console.log fix (0.9) should come first
    expect(result.fixes[0]?.confidence).toBeGreaterThan(result.fixes[1]?.confidence ?? 0);
  });

  it('should count high-confidence fixes correctly', async () => {
    const issues = [
      createIssue({ message: 'console.log found', category: 'code-quality' }), // high confidence
      createIssue({ message: 'Avoid using "as any"', category: 'type-safety' }), // medium confidence
    ];

    const result = await generateAutoFixes(issues, createOptions());

    expect(result.highConfidenceFixes).toBe(1); // only console.log fix >= 0.8
  });

  it('should handle empty issues array', async () => {
    const result = await generateAutoFixes([], createOptions());

    expect(result.fixes).toHaveLength(0);
    expect(result.unfixableIssues).toHaveLength(0);
    expect(result.highConfidenceFixes).toBe(0);
    expect(result.cost).toBe(0);
  });

  it('should not call LLM when useLLM is false', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const issues = [createIssue({ message: 'Complex issue' })];
    await generateAutoFixes(issues, createOptions({ useLLM: false }));

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ============================================================================
// LLM-Based Fixes
// ============================================================================

describe('generateAutoFixes — LLM-based', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function setupMockClient(responseContent: string): LLMClient {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: responseContent } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'kimi-2.5',
      }),
    });

    return new LLMClient({
      apiKey: 'test-key',
      endpoint: 'https://test.endpoint.com',
      model: 'kimi-2.5',
      temperature: 0.3,
      maxTokens: 4096,
      timeoutMs: 30000,
      rateLimit: 60,
    });
  }

  it('should call LLM for issues with no pattern match', async () => {
    const llmResponse = JSON.stringify({
      replacement: 'const token = validateToken(rawToken);',
      original: 'const token = rawToken;',
      confidence: 0.8,
      description: 'Add token validation',
    });

    const client = setupMockClient(llmResponse);
    const issues = [
      createIssue({
        message: 'Token is used without validation',
        category: 'security',
      }),
    ];

    const result = await generateAutoFixes(issues, { client, useLLM: true });

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.source).toBe('llm');
    expect(result.fixes[0]?.replacement).toContain('validateToken');
  });

  it('should prefer pattern-based fix over LLM', async () => {
    const client = setupMockClient(
      JSON.stringify({ replacement: 'llm-replacement', confidence: 0.9, description: 'LLM fix' })
    );

    const issues = [createIssue({ message: 'console.log found' })];

    const result = await generateAutoFixes(issues, { client, useLLM: true });

    // Pattern match should be used, not LLM
    expect(result.fixes[0]?.source).toBe('pattern');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should discard LLM fix with low confidence', async () => {
    const llmResponse = JSON.stringify({
      replacement: 'some replacement',
      original: null,
      confidence: 0.2,
      description: 'Low confidence fix',
    });

    const client = setupMockClient(llmResponse);
    const issues = [createIssue({ message: 'Complex issue that needs LLM' })];

    const result = await generateAutoFixes(issues, { client, useLLM: true });

    expect(result.fixes).toHaveLength(0);
    expect(result.unfixableIssues).toHaveLength(1);
  });

  it('should handle LLM returning malformed JSON', async () => {
    const client = setupMockClient('Not valid JSON at all');
    const issues = [createIssue({ message: 'Complex issue' })];

    const result = await generateAutoFixes(issues, { client, useLLM: true });

    expect(result.fixes).toHaveLength(0);
    expect(result.unfixableIssues).toHaveLength(1);
  });

  it('should respect maxLLMFixes limit', async () => {
    const client = setupMockClient(
      JSON.stringify({ replacement: 'fix', confidence: 0.8, description: 'Fix' })
    );

    const issues = Array.from({ length: 5 }, (_, i) =>
      createIssue({ file: `src/file${i}.ts`, message: 'Complex issue' })
    );

    await generateAutoFixes(issues, { client, useLLM: true, maxLLMFixes: 2 });

    // Should only call LLM twice
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('should track cost and latency from LLM calls', async () => {
    const client = setupMockClient(
      JSON.stringify({ replacement: 'fix', confidence: 0.8, description: 'Fix' })
    );

    const issues = [createIssue({ message: 'Complex issue' })];

    const result = await generateAutoFixes(issues, { client, useLLM: true });

    expect(result.cost).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// formatAutoFixesAsMarkdown
// ============================================================================

describe('formatAutoFixesAsMarkdown', () => {
  function buildFix(overrides: Partial<FixSuggestion> = {}): FixSuggestion {
    return {
      issue: createIssue({ message: 'console.log found' }),
      confidence: 0.9,
      replacement: '// removed console.log',
      original: 'console.log("debug")',
      description: 'Remove console.log statement',
      source: 'pattern',
      autoApplicable: true,
      ...overrides,
    };
  }

  it('should return empty string when no fixes', () => {
    const result = {
      fixes: [],
      unfixableIssues: [],
      highConfidenceFixes: 0,
      cost: 0,
      latencyMs: 0,
    };

    expect(formatAutoFixesAsMarkdown(result)).toBe('');
  });

  it('should include fix count in header', () => {
    const result = {
      fixes: [buildFix()],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('Auto-Fix Suggestions (1)');
  });

  it('should highlight high-confidence fixes', () => {
    const result = {
      fixes: [buildFix({ confidence: 0.9 })],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('high-confidence fix');
  });

  it('should include confidence label and percentage', () => {
    const result = {
      fixes: [buildFix({ confidence: 0.85 })],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('85%');
  });

  it('should include original code when present', () => {
    const result = {
      fixes: [buildFix({ original: 'console.log("debug")' })],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('Original:');
    expect(md).toContain('console.log("debug")');
  });

  it('should include replacement in suggestion block', () => {
    const result = {
      fixes: [buildFix({ replacement: '// removed' })],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('```suggestion');
    expect(md).toContain('// removed');
  });

  it('should include source label', () => {
    const result = {
      fixes: [buildFix({ source: 'llm' })],
      unfixableIssues: [],
      highConfidenceFixes: 0,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('LLM-generated');
  });

  it('should mention unfixable issues count', () => {
    const result = {
      fixes: [buildFix()],
      unfixableIssues: [createIssue(), createIssue()],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain('2 issue(s) could not be auto-fixed');
  });

  it('should use green circle for high confidence', () => {
    const result = {
      fixes: [buildFix({ confidence: 0.95 })],
      unfixableIssues: [],
      highConfidenceFixes: 1,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain(':green_circle:');
  });

  it('should use yellow circle for medium confidence', () => {
    const result = {
      fixes: [buildFix({ confidence: 0.75 })],
      unfixableIssues: [],
      highConfidenceFixes: 0,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain(':yellow_circle:');
  });

  it('should use red circle for low confidence', () => {
    const result = {
      fixes: [buildFix({ confidence: 0.55 })],
      unfixableIssues: [],
      highConfidenceFixes: 0,
      cost: 0,
      latencyMs: 0,
    };

    const md = formatAutoFixesAsMarkdown(result);
    expect(md).toContain(':red_circle:');
  });
});
