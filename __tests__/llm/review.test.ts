/**
 * Tests for Semantic Review Engine
 */

import {
  parseReviewResponse,
  runReview,
  formatReviewAsMarkdown,
  reviewIssuesToViolations,
  type ReviewIssue,
  type LLMReviewResult,
} from '../../src/llm/review';
import { LLMClient } from '../../src/llm/provider';
import type { ReviewContext, PRDiff } from '../../src/llm/context';

describe('Semantic Review Engine', () => {
  // ============================================================================
  // parseReviewResponse
  // ============================================================================

  describe('parseReviewResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        issues: [
          {
            file: 'src/index.ts',
            line: 10,
            severity: 'error',
            message: 'Potential security issue',
            suggestion: 'Use parameterized queries',
            category: 'security',
          },
        ],
        summary: 'Found 1 security issue',
        confidence: 0.9,
      });

      const result = parseReviewResponse(response);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].file).toBe('src/index.ts');
      expect(result.issues[0].severity).toBe('error');
      expect(result.summary).toBe('Found 1 security issue');
      expect(result.confidence).toBe(0.9);
    });

    it('should parse JSON in markdown code block', () => {
      const response = `\`\`\`json
{
  "issues": [],
  "summary": "No issues found",
  "confidence": 0.95
}
\`\`\``;

      const result = parseReviewResponse(response);

      expect(result.issues).toHaveLength(0);
      expect(result.summary).toBe('No issues found');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle missing optional fields', () => {
      const response = JSON.stringify({
        issues: [
          {
            file: 'src/index.ts',
            message: 'Issue without optional fields',
          },
        ],
        summary: 'Found issues',
      });

      const result = parseReviewResponse(response);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].line).toBe(0);
      expect(result.issues[0].severity).toBe('warning');
      expect(result.issues[0].suggestion).toBeUndefined();
      expect(result.confidence).toBe(0.5);
    });

    it('should skip invalid issues', () => {
      const response = JSON.stringify({
        issues: [
          { file: 'valid.ts', message: 'Valid issue' },
          { file: 'missing-message.ts' },
          { message: 'Missing file' },
          { file: 'another-valid.ts', message: 'Another valid' },
        ],
        summary: 'Test',
        confidence: 0.8,
      });

      const result = parseReviewResponse(response);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].file).toBe('valid.ts');
      expect(result.issues[1].file).toBe('another-valid.ts');
    });

    it('should handle invalid JSON', () => {
      const response = 'This is not JSON at all';

      const result = parseReviewResponse(response);

      expect(result.issues).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should clamp confidence to 0-1 range', () => {
      const response = JSON.stringify({
        issues: [],
        summary: 'Test',
        confidence: 1.5,
      });

      const result = parseReviewResponse(response);
      expect(result.confidence).toBe(1);
    });
  });

  // ============================================================================
  // runReview
  // ============================================================================

  describe('runReview', () => {
    let mockClient: LLMClient;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function createMockContext(): ReviewContext {
      const diff: PRDiff = {
        base: 'main',
        head: 'feature',
        files: [
          {
            path: 'src/index.ts',
            status: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 1,
                newStart: 1,
                newLines: 2,
                content: '+const x = 1;',
              },
            ],
            additions: 1,
            deletions: 0,
          },
        ],
        totalAdditions: 1,
        totalDeletions: 0,
      };

      return {
        diff,
        fileContents: [],
        violations: [],
        conventions: [],
        totalTokens: 100,
        truncated: false,
        warnings: [],
      };
    }

    it('should run review and return structured result', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  issues: [
                    {
                      file: 'src/index.ts',
                      line: 1,
                      severity: 'warning',
                      message: 'Consider adding type annotation',
                    },
                  ],
                  summary: 'Minor type safety improvement suggested',
                  confidence: 0.85,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      } as Response);

      mockClient = new LLMClient({ apiKey: 'test-key', endpoint: 'https://test.openai.azure.com' });
      const context = createMockContext();

      const result = await runReview({
        client: mockClient,
        context,
      });

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].file).toBe('src/index.ts');
      expect(result.summary).toBe('Minor type safety improvement suggested');
      expect(result.confidence).toBe(0.85);
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
    });

    it('should limit issues to maxIssues', async () => {
      const manyIssues = Array.from({ length: 100 }, (_, i) => ({
        file: `file${i}.ts`,
        line: i,
        severity: 'warning',
        message: `Issue ${i}`,
      }));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  issues: manyIssues,
                  summary: 'Many issues',
                  confidence: 0.9,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        }),
      } as Response);

      mockClient = new LLMClient({ apiKey: 'test-key', endpoint: 'https://test.openai.azure.com' });
      const context = createMockContext();

      const result = await runReview({
        client: mockClient,
        context,
        maxIssues: 10,
      });

      expect(result.issues).toHaveLength(10);
    });

    it('should include raw response when requested', async () => {
      const rawResponse = JSON.stringify({
        issues: [],
        summary: 'All good',
        confidence: 0.95,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: rawResponse } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
      } as Response);

      mockClient = new LLMClient({ apiKey: 'test-key', endpoint: 'https://test.openai.azure.com' });
      const context = createMockContext();

      const result = await runReview({
        client: mockClient,
        context,
        includeRawResponse: true,
      });

      expect(result.rawResponse).toBe(rawResponse);
    });
  });

  // ============================================================================
  // formatReviewAsMarkdown
  // ============================================================================

  describe('formatReviewAsMarkdown', () => {
    it('should format review with no issues', () => {
      const result: LLMReviewResult = {
        issues: [],
        summary: 'Code looks great!',
        confidence: 0.95,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.003,
        latencyMs: 500,
      };

      const markdown = formatReviewAsMarkdown(result);

      expect(markdown).toContain('# LLM Code Review');
      expect(markdown).toContain('Code looks great!');
      expect(markdown).toContain('Confidence:** 95%');
      expect(markdown).toContain('No issues found');
    });

    it('should group issues by severity', () => {
      const result: LLMReviewResult = {
        issues: [
          { file: 'a.ts', line: 1, severity: 'error', message: 'Error issue' },
          { file: 'b.ts', line: 2, severity: 'warning', message: 'Warning issue' },
          { file: 'c.ts', line: 3, severity: 'info', message: 'Info issue' },
        ],
        summary: 'Found issues',
        confidence: 0.8,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.003,
        latencyMs: 500,
      };

      const markdown = formatReviewAsMarkdown(result);

      expect(markdown).toContain('## Errors');
      expect(markdown).toContain('## Warnings');
      expect(markdown).toContain('## Suggestions');
      expect(markdown).toContain('Error issue');
      expect(markdown).toContain('Warning issue');
      expect(markdown).toContain('Info issue');
    });

    it('should include suggestions and categories', () => {
      const result: LLMReviewResult = {
        issues: [
          {
            file: 'src/index.ts',
            line: 42,
            severity: 'warning',
            message: 'Use const instead of let',
            suggestion: 'Change let to const',
            category: 'code-quality',
          },
        ],
        summary: 'Minor improvements',
        confidence: 0.9,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.003,
        latencyMs: 500,
      };

      const markdown = formatReviewAsMarkdown(result);

      expect(markdown).toContain('src/index.ts:42');
      expect(markdown).toContain('Change let to const');
      expect(markdown).toContain('code-quality');
    });
  });

  // ============================================================================
  // reviewIssuesToViolations
  // ============================================================================

  describe('reviewIssuesToViolations', () => {
    it('should convert issues to violations', () => {
      const issues: ReviewIssue[] = [
        {
          file: 'src/index.ts',
          line: 10,
          severity: 'error',
          message: 'Security issue',
          category: 'security',
        },
        {
          file: 'src/utils.ts',
          line: 20,
          severity: 'warning',
          message: 'Performance issue',
        },
      ];

      const violations = reviewIssuesToViolations(issues, 'llm-review');

      expect(violations).toHaveLength(2);

      expect(violations[0].ruleId).toBe('llm-security');
      expect(violations[0].file).toBe('src/index.ts');
      expect(violations[0].severity).toBe('error');

      expect(violations[1].ruleId).toBe('llm-review');
      expect(violations[1].severity).toBe('warning');
    });

    it('should handle info severity as warning', () => {
      const issues: ReviewIssue[] = [
        {
          file: 'src/index.ts',
          line: 10,
          severity: 'info',
          message: 'Suggestion',
        },
      ];

      const violations = reviewIssuesToViolations(issues, 'llm-review');

      expect(violations[0].severity).toBe('warning');
    });
  });
});
