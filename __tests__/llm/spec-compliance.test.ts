/**
 * Tests for Spec Compliance Analysis (S075)
 */

import {
  analyzeSpecCompliance,
  parseAcceptanceCriteria,
  formatComplianceAsMarkdown,
  type SpecRequirement,
  type SpecComplianceResult,
} from '../../src/llm/spec-compliance';
import { LLMClient } from '../../src/llm/provider';
import type { ReviewContext, PRDiff } from '../../src/llm/context';

// ============================================================================
// Helpers
// ============================================================================

function createMockContext(): ReviewContext {
  const diff: PRDiff = {
    base: 'main',
    head: 'feature',
    files: [
      {
        path: 'src/auth.ts',
        status: 'modified',
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 3,
            content: '+export function validateToken(token: string): boolean {\n+  return token.length > 10;\n+}',
          },
        ],
        additions: 3,
        deletions: 1,
      },
    ],
    totalAdditions: 3,
    totalDeletions: 1,
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

function createSampleRequirements(): SpecRequirement[] {
  return [
    { id: 'AC-1', description: 'Token validation must reject tokens shorter than 10 characters' },
    { id: 'AC-2', description: 'Auth module must export a validateToken function' },
    { id: 'AC-3', description: 'Validation errors must include error codes', source: 'Story S001' },
  ];
}

function createComplianceResponse(overrides: Partial<{
  results: Array<{ id: string; met: boolean; confidence: number; explanation: string; locations: Array<{ file: string; line: number; note: string }> }>;
  summary: string;
  overallConfidence: number;
}> = {}): string {
  const defaults = {
    results: [
      {
        id: 'AC-1',
        met: true,
        confidence: 0.9,
        explanation: 'Line 2 checks token.length > 10, rejecting short tokens.',
        locations: [{ file: 'src/auth.ts', line: 2, note: 'length check' }],
      },
      {
        id: 'AC-2',
        met: true,
        confidence: 0.95,
        explanation: 'validateToken is exported from src/auth.ts.',
        locations: [{ file: 'src/auth.ts', line: 1, note: 'export declaration' }],
      },
      {
        id: 'AC-3',
        met: false,
        confidence: 0.85,
        explanation: 'The function returns a boolean but does not throw errors with error codes.',
        locations: [],
      },
    ],
    summary: '2 of 3 requirements met. Missing error codes in validation.',
    overallConfidence: 0.9,
  };

  return JSON.stringify({ ...defaults, ...overrides });
}

// ============================================================================
// parseAcceptanceCriteria
// ============================================================================

describe('parseAcceptanceCriteria', () => {
  it('should parse GitHub-style checklist items', () => {
    const text = `
- [ ] AC-1: Token validation must work
- [x] AC-2: Module must export validateToken
- [ ] AC-3: Errors must include codes
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(3);
    expect(requirements[0]).toEqual({ id: 'AC-1', description: 'Token validation must work' });
    expect(requirements[1]).toEqual({ id: 'AC-2', description: 'Module must export validateToken' });
    expect(requirements[2]).toEqual({ id: 'AC-3', description: 'Errors must include codes' });
  });

  it('should parse plain numbered lists', () => {
    const text = `
1. Token validation must work
2. Module must export validateToken
3. Errors must include codes
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(3);
    expect(requirements[0]?.id).toBe('AC-1');
    expect(requirements[0]?.description).toBe('Token validation must work');
    expect(requirements[2]?.id).toBe('AC-3');
  });

  it('should parse dash-prefixed lists without IDs', () => {
    const text = `
- Token validation must work
- Module must export validateToken
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(2);
    expect(requirements[0]?.id).toBe('AC-1');
    expect(requirements[1]?.id).toBe('AC-2');
  });

  it('should extract explicit IDs with colon format', () => {
    const text = `
- req-auth-01: Token must be validated
- req-auth-02: JWT signature must be verified
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(2);
    expect(requirements[0]?.id).toBe('req-auth-01');
    expect(requirements[0]?.description).toBe('Token must be validated');
    expect(requirements[1]?.id).toBe('req-auth-02');
  });

  it('should skip section headers', () => {
    const text = `
## Acceptance Criteria
- AC-1: Requirement one
## Notes
- AC-2: Requirement two
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(2);
    expect(requirements[0]?.id).toBe('AC-1');
    expect(requirements[1]?.id).toBe('AC-2');
  });

  it('should return empty array for empty input', () => {
    expect(parseAcceptanceCriteria('')).toEqual([]);
    expect(parseAcceptanceCriteria('   \n\n   ')).toEqual([]);
  });

  it('should handle mixed formats in same block', () => {
    const text = `
- [ ] AC-1: Explicit ID
- Plain item without ID
3. Another plain item
`;
    const requirements = parseAcceptanceCriteria(text);

    expect(requirements).toHaveLength(3);
    expect(requirements[0]?.id).toBe('AC-1');
    expect(requirements[1]?.id).toBe('AC-1'); // auto-index resets per format? No — sequential
    // Actually auto-index is global: starts at 1, only increments for non-ID items
    expect(requirements[1]?.description).toBe('Plain item without ID');
    expect(requirements[2]?.description).toBe('Another plain item');
  });
});

// ============================================================================
// analyzeSpecCompliance
// ============================================================================

describe('analyzeSpecCompliance', () => {
  let mockClient: LLMClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function setupMockFetch(responseContent: string): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: responseContent } }],
        usage: { prompt_tokens: 200, completion_tokens: 100 },
        model: 'kimi-2.5',
      }),
    });

    mockClient = new LLMClient({
      apiKey: 'test-key',
      endpoint: 'https://test.endpoint.com',
      model: 'kimi-2.5',
      temperature: 0.3,
      maxTokens: 4096,
      timeoutMs: 30000,
      rateLimit: 60,
    });
  }

  it('should return 100% compliance when all requirements are met', async () => {
    const responseContent = JSON.stringify({
      results: [
        { id: 'AC-1', met: true, confidence: 0.95, explanation: 'Met.', locations: [] },
        { id: 'AC-2', met: true, confidence: 0.9, explanation: 'Met.', locations: [] },
        { id: 'AC-3', met: true, confidence: 0.85, explanation: 'Met.', locations: [] },
      ],
      summary: 'All requirements met.',
      overallConfidence: 0.9,
    });

    setupMockFetch(responseContent);

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.complianceScore).toBe(1);
    expect(result.metRequirements).toHaveLength(3);
    expect(result.missedRequirements).toHaveLength(0);
    expect(result.summary).toBe('All requirements met.');
  });

  it('should compute partial compliance score correctly', async () => {
    setupMockFetch(createComplianceResponse());

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.complianceScore).toBeCloseTo(2 / 3, 5);
    expect(result.metRequirements).toHaveLength(2);
    expect(result.missedRequirements).toHaveLength(1);
    expect(result.missedRequirements[0]?.requirement.id).toBe('AC-3');
  });

  it('should include locations in results', async () => {
    setupMockFetch(createComplianceResponse());

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    const ac1 = result.requirementResults.find((r) => r.requirement.id === 'AC-1');
    expect(ac1).toBeDefined();
    expect(ac1?.locations).toHaveLength(1);
    expect(ac1?.locations?.[0]?.file).toBe('src/auth.ts');
    expect(ac1?.locations?.[0]?.line).toBe(2);
  });

  it('should include raw response when requested', async () => {
    const rawContent = createComplianceResponse();
    setupMockFetch(rawContent);

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
      includeRawResponse: true,
    });

    expect(result.rawResponse).toBe(rawContent);
  });

  it('should not include raw response by default', async () => {
    setupMockFetch(createComplianceResponse());

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.rawResponse).toBeUndefined();
  });

  it('should return perfect score with no requirements', async () => {
    setupMockFetch('{}');

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: [],
    });

    expect(result.complianceScore).toBe(1);
    expect(result.requirementResults).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle malformed LLM response gracefully', async () => {
    setupMockFetch('This is not JSON');

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    // All requirements marked as unmet
    expect(result.complianceScore).toBe(0);
    expect(result.missedRequirements).toHaveLength(3);
    expect(result.overallConfidence).toBe(0);
  });

  it('should handle LLM response missing some requirements', async () => {
    // LLM only returns result for AC-1
    const partialResponse = JSON.stringify({
      results: [
        { id: 'AC-1', met: true, confidence: 0.9, explanation: 'Met.', locations: [] },
      ],
      summary: 'Partial response.',
      overallConfidence: 0.7,
    });

    setupMockFetch(partialResponse);

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    // AC-2 and AC-3 should be added as unmet
    expect(result.requirementResults).toHaveLength(3);
    const ac2 = result.requirementResults.find((r) => r.requirement.id === 'AC-2');
    expect(ac2?.met).toBe(false);
    expect(ac2?.confidence).toBe(0);
  });

  it('should parse JSON wrapped in markdown code block', async () => {
    const wrappedResponse = `\`\`\`json
${createComplianceResponse()}
\`\`\``;

    setupMockFetch(wrappedResponse);

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.requirementResults).toHaveLength(3);
    expect(result.complianceScore).toBeCloseTo(2 / 3, 5);
  });

  it('should clamp confidence values to 0-1 range', async () => {
    const response = JSON.stringify({
      results: [
        { id: 'AC-1', met: true, confidence: 1.5, explanation: 'Met.', locations: [] },
        { id: 'AC-2', met: false, confidence: -0.2, explanation: 'Not met.', locations: [] },
        { id: 'AC-3', met: true, confidence: 0.8, explanation: 'Met.', locations: [] },
      ],
      summary: 'Test.',
      overallConfidence: 2.0,
    });

    setupMockFetch(response);

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.requirementResults[0]?.confidence).toBe(1);
    expect(result.requirementResults[1]?.confidence).toBe(0);
    expect(result.overallConfidence).toBe(1);
  });

  it('should pass story description and acceptance criteria to LLM', async () => {
    setupMockFetch(createComplianceResponse());

    await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
      storyDescription: 'As a user, I want token validation',
      acceptanceCriteria: 'Tokens must be validated securely',
    });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as { messages: Array<{ role: string; content: string }> };
    const userMessage = body.messages.find((m) => m.role === 'user');

    expect(userMessage?.content).toContain('As a user, I want token validation');
    expect(userMessage?.content).toContain('Tokens must be validated securely');
  });

  it('should track token usage and cost', async () => {
    setupMockFetch(createComplianceResponse());

    const result = await analyzeSpecCompliance({
      client: mockClient,
      context: createMockContext(),
      requirements: createSampleRequirements(),
    });

    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// formatComplianceAsMarkdown
// ============================================================================

describe('formatComplianceAsMarkdown', () => {
  function buildResult(overrides: Partial<SpecComplianceResult> = {}): SpecComplianceResult {
    const requirements = createSampleRequirements();
    const requirementResults = [
      {
        requirement: requirements[0]!,
        met: true,
        confidence: 0.9,
        explanation: 'Length check on line 2.',
        locations: [{ file: 'src/auth.ts', line: 2, note: 'length check' }],
      },
      {
        requirement: requirements[1]!,
        met: true,
        confidence: 0.95,
        explanation: 'Export on line 1.',
      },
      {
        requirement: requirements[2]!,
        met: false,
        confidence: 0.85,
        explanation: 'Returns boolean, no error codes.',
      },
    ];

    return {
      complianceScore: 2 / 3,
      requirementResults,
      metRequirements: requirementResults.filter((r) => r.met),
      missedRequirements: requirementResults.filter((r) => !r.met),
      overallConfidence: 0.9,
      summary: '2 of 3 requirements met.',
      inputTokens: 200,
      outputTokens: 100,
      cost: 0.001,
      latencyMs: 500,
      ...overrides,
    };
  }

  it('should include compliance score in output', () => {
    const markdown = formatComplianceAsMarkdown(buildResult());

    expect(markdown).toContain('67%');
    expect(markdown).toContain('2/3 requirements met');
  });

  it('should include summary', () => {
    const markdown = formatComplianceAsMarkdown(buildResult());

    expect(markdown).toContain('2 of 3 requirements met.');
  });

  it('should show unmet requirements in collapsible section', () => {
    const markdown = formatComplianceAsMarkdown(buildResult());

    expect(markdown).toContain('Unmet Requirements');
    expect(markdown).toContain('[AC-3]');
    expect(markdown).toContain('Returns boolean, no error codes.');
  });

  it('should show met requirements in collapsible section', () => {
    const markdown = formatComplianceAsMarkdown(buildResult());

    expect(markdown).toContain('Met Requirements');
    expect(markdown).toContain('[AC-1]');
    expect(markdown).toContain('[AC-2]');
  });

  it('should include file locations for unmet requirements', () => {
    const result = buildResult();
    // Add location to the missed requirement
    result.missedRequirements[0]!.locations = [
      { file: 'src/auth.ts', line: 10, note: 'missing error code' },
    ];
    result.requirementResults[2]!.locations = [
      { file: 'src/auth.ts', line: 10, note: 'missing error code' },
    ];

    const markdown = formatComplianceAsMarkdown(result);

    expect(markdown).toContain('src/auth.ts:10');
    expect(markdown).toContain('missing error code');
  });

  it('should use green checkmark icon for high compliance', () => {
    const result = buildResult({ complianceScore: 0.95 });
    const markdown = formatComplianceAsMarkdown(result);

    expect(markdown).toContain(':white_check_mark:');
  });

  it('should use warning icon for medium compliance', () => {
    const result = buildResult({ complianceScore: 0.75 });
    const markdown = formatComplianceAsMarkdown(result);

    expect(markdown).toContain(':warning:');
  });

  it('should use error icon for low compliance', () => {
    const result = buildResult({ complianceScore: 0.5 });
    const markdown = formatComplianceAsMarkdown(result);

    expect(markdown).toContain(':x:');
  });

  it('should not show unmet section when all requirements are met', () => {
    const requirements = createSampleRequirements();
    const allMet = requirements.map((req) => ({
      requirement: req,
      met: true,
      confidence: 0.9,
      explanation: 'Met.',
    }));

    const result = buildResult({
      complianceScore: 1,
      requirementResults: allMet,
      metRequirements: allMet,
      missedRequirements: [],
    });

    const markdown = formatComplianceAsMarkdown(result);

    expect(markdown).not.toContain('Unmet Requirements');
    expect(markdown).toContain('Met Requirements');
  });
});
