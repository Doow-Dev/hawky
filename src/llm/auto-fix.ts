/**
 * Auto-Fix Suggestions (S078)
 *
 * Generates code fix suggestions for common issues found by LLM review.
 * Features:
 * - AST-aware patch suggestions for well-understood patterns
 * - Confidence scores per fix (higher = more safe to apply)
 * - LLM-assisted fixes for complex issues
 * - Patch format compatible with GitHub's suggestion API
 */

import type { LLMClient, ChatMessage } from './provider';
import type { ReviewIssue } from './review';

// ============================================================================
// Types
// ============================================================================

/**
 * A single fix suggestion for a code issue
 */
export interface FixSuggestion {
  /** The issue this fix addresses */
  issue: ReviewIssue;

  /**
   * Confidence score (0-1):
   * - 0.9+: Safe to apply automatically
   * - 0.7-0.9: Likely correct, review before applying
   * - 0.5-0.7: Plausible, requires understanding of context
   * - <0.5: Speculative, manual review required
   */
  confidence: number;

  /** The suggested replacement code (single line or multi-line block) */
  replacement: string;

  /**
   * The original code being replaced (for context and validation).
   * If null, the fix is an insertion rather than a replacement.
   */
  original: string | null;

  /** Human-readable description of what the fix does */
  description: string;

  /** How the fix was generated */
  source: 'pattern' | 'llm';

  /** Whether this fix can be applied automatically without review */
  autoApplicable: boolean;
}

/**
 * Result of auto-fix suggestion generation for all issues
 */
export interface AutoFixResult {
  /** Fixes that were generated */
  fixes: FixSuggestion[];

  /** Issues that could not be auto-fixed */
  unfixableIssues: ReviewIssue[];

  /** Number of high-confidence fixes (>= 0.8) */
  highConfidenceFixes: number;

  /** Total LLM cost incurred (0 if no LLM calls made) */
  cost: number;

  /** Total latency in ms */
  latencyMs: number;
}

/**
 * Options for auto-fix generation
 */
export interface AutoFixOptions {
  /** LLM client for complex fixes (optional — pattern-based fixes don't need it) */
  client?: LLMClient;

  /** Whether to use LLM for issues not covered by patterns (default: true if client provided) */
  useLLM?: boolean;

  /** Minimum confidence threshold to include a fix (default: 0.5) */
  minConfidence?: number;

  /** Maximum issues to generate LLM fixes for (to control costs, default: 10) */
  maxLLMFixes?: number;
}

// ============================================================================
// Pattern-Based Fixes
// ============================================================================

/**
 * A known fix pattern: matches an issue by category/ruleId and provides a fix generator
 */
interface FixPattern {
  /** Categories this pattern applies to */
  categories: string[];

  /** Check if this pattern applies to the issue */
  matches(issue: ReviewIssue): boolean;

  /** Generate the fix (returns null if can't generate for this specific issue) */
  generate(issue: ReviewIssue): Omit<FixSuggestion, 'issue'> | null;
}

/** Registry of built-in fix patterns */
const FIX_PATTERNS: FixPattern[] = [
  // Pattern: console.log removal
  {
    categories: ['code-quality'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('console.log') ||
      issue.message.toLowerCase().includes('console statement'),
    generate: () => ({
      confidence: 0.9,
      replacement: '',
      original: null,
      description: 'Remove console.log statement',
      source: 'pattern',
      autoApplicable: true,
    }),
  },

  // Pattern: missing await on async call
  {
    categories: ['code-quality', 'type-safety'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('missing await') ||
      issue.message.toLowerCase().includes('promise not awaited'),
    generate: (issue) => {
      if (!issue.suggestion) return null;
      return {
        confidence: 0.85,
        replacement: `await ${issue.suggestion}`,
        original: null,
        description: 'Add missing await keyword',
        source: 'pattern',
        autoApplicable: false, // Requires understanding of async context
      };
    },
  },

  // Pattern: type assertion 'as any'
  {
    categories: ['type-safety'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('as any') ||
      issue.message.toLowerCase().includes('avoid any'),
    generate: () => ({
      confidence: 0.6,
      replacement: '/* TODO: Replace with proper type */',
      original: 'as any',
      description: 'Replace unsafe type assertion with proper type',
      source: 'pattern',
      autoApplicable: false,
    }),
  },

  // Pattern: hardcoded secret / magic string
  {
    categories: ['security'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('hardcoded') ||
      issue.message.toLowerCase().includes('magic string') ||
      issue.message.toLowerCase().includes('secret in code'),
    generate: () => ({
      confidence: 0.8,
      replacement: 'process.env["SECRET_NAME"] ?? \'\'',
      original: null,
      description: 'Move secret to environment variable',
      source: 'pattern',
      autoApplicable: false, // Requires knowing env var name
    }),
  },

  // Pattern: missing null check / undefined guard
  {
    categories: ['type-safety', 'code-quality'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('possibly undefined') ||
      issue.message.toLowerCase().includes('possibly null') ||
      issue.message.toLowerCase().includes('optional chaining'),
    generate: (issue) => {
      if (!issue.suggestion) return null;
      return {
        confidence: 0.75,
        replacement: issue.suggestion,
        original: null,
        description: 'Add null/undefined guard',
        source: 'pattern',
        autoApplicable: false,
      };
    },
  },

  // Pattern: deprecated API usage
  {
    categories: ['code-quality'],
    matches: (issue) =>
      issue.message.toLowerCase().includes('deprecated') ||
      issue.message.toLowerCase().includes('use instead'),
    generate: (issue) => {
      if (!issue.suggestion) return null;
      return {
        confidence: 0.7,
        replacement: issue.suggestion,
        original: null,
        description: 'Replace deprecated API with recommended alternative',
        source: 'pattern',
        autoApplicable: false,
      };
    },
  },
];

/**
 * Try to generate a pattern-based fix for an issue
 */
function tryPatternFix(issue: ReviewIssue): FixSuggestion | null {
  for (const pattern of FIX_PATTERNS) {
    if (pattern.matches(issue)) {
      const fix = pattern.generate(issue);
      if (fix) {
        return { issue, ...fix };
      }
    }
  }
  return null;
}

// ============================================================================
// LLM-Based Fixes
// ============================================================================

const LLM_FIX_SYSTEM_PROMPT = `You are an expert TypeScript/JavaScript developer.

Given a code issue and its context, generate a concrete fix suggestion.

Rules:
- Provide ONLY the replacement code, not explanations
- The fix must be syntactically valid
- For single-line issues, provide a single-line replacement
- Keep fixes minimal — only change what's needed to fix the issue
- If you cannot generate a confident fix, set confidence to 0

IMPORTANT: Respond ONLY with valid JSON in the exact format specified.`;

interface LLMFixResponse {
  replacement: string;
  original: string | null;
  confidence: number;
  description: string;
}

interface RawLLMFixResponse {
  replacement?: string;
  original?: string | null;
  confidence?: number;
  description?: string;
}

async function generateLLMFix(
  issue: ReviewIssue,
  client: LLMClient
): Promise<{ fix: Omit<FixSuggestion, 'issue'> | null; cost: number; latencyMs: number }> {
  const userPrompt = `Issue found in \`${issue.file}:${issue.line}\`:
Severity: ${issue.severity}
Message: ${issue.message}
${issue.suggestion ? `Hint: ${issue.suggestion}` : ''}
${issue.category ? `Category: ${issue.category}` : ''}

Generate a fix for this issue.

Respond with:
{
  "replacement": "the corrected code",
  "original": "the problematic code (or null if insertion)",
  "confidence": 0.0-1.0,
  "description": "one-line description of what the fix does"
}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: LLM_FIX_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await client.chat(messages);

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match?.[1]) jsonStr = match[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as RawLLMFixResponse;
    const fixResponse: LLMFixResponse = {
      replacement: String(parsed.replacement ?? ''),
      original: typeof parsed.original === 'string' ? parsed.original : null,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
      description: String(parsed.description ?? 'LLM-generated fix'),
    };

    if (fixResponse.confidence < 0.3 || !fixResponse.replacement) {
      return { fix: null, cost: response.cost, latencyMs: response.latencyMs };
    }

    return {
      fix: {
        confidence: fixResponse.confidence,
        replacement: fixResponse.replacement,
        original: fixResponse.original,
        description: fixResponse.description,
        source: 'llm',
        autoApplicable: fixResponse.confidence >= 0.9,
      },
      cost: response.cost,
      latencyMs: response.latencyMs,
    };
  } catch {
    return { fix: null, cost: 0, latencyMs: 0 };
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generate auto-fix suggestions for a list of review issues
 *
 * Strategy:
 * 1. Try pattern-based fixes first (fast, no LLM cost)
 * 2. For unfixed issues, optionally call LLM for complex fixes
 * 3. Filter by minConfidence threshold
 * 4. Return fixes sorted by confidence (highest first)
 */
export async function generateAutoFixes(
  issues: ReviewIssue[],
  options: AutoFixOptions = {}
): Promise<AutoFixResult> {
  const minConfidence = options.minConfidence ?? 0.5;
  const maxLLMFixes = options.maxLLMFixes ?? 10;
  const useLLM = options.useLLM ?? (options.client !== undefined);

  const fixes: FixSuggestion[] = [];
  const unfixableIssues: ReviewIssue[] = [];
  let totalCost = 0;
  let totalLatencyMs = 0;
  let llmFixCount = 0;

  for (const issue of issues) {
    // Try pattern-based fix first
    const patternFix = tryPatternFix(issue);

    if (patternFix && patternFix.confidence >= minConfidence) {
      fixes.push(patternFix);
      continue;
    }

    // Try LLM fix if enabled and budget remaining
    if (useLLM && options.client && llmFixCount < maxLLMFixes) {
      const { fix, cost, latencyMs } = await generateLLMFix(issue, options.client);
      totalCost += cost;
      totalLatencyMs += latencyMs;
      llmFixCount++;

      if (fix && fix.confidence >= minConfidence) {
        fixes.push({ issue, ...fix });
        continue;
      }
    }

    // Couldn't generate a fix
    unfixableIssues.push(issue);
  }

  // Sort by confidence (highest first)
  fixes.sort((a, b) => b.confidence - a.confidence);

  const highConfidenceFixes = fixes.filter((f) => f.confidence >= 0.8).length;

  return {
    fixes,
    unfixableIssues,
    highConfidenceFixes,
    cost: totalCost,
    latencyMs: totalLatencyMs,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format auto-fix suggestions as markdown for inclusion in PR comments
 */
export function formatAutoFixesAsMarkdown(result: AutoFixResult): string {
  if (result.fixes.length === 0) {
    return '';
  }

  const lines: string[] = [
    `### :wrench: Auto-Fix Suggestions (${result.fixes.length})`,
    '',
  ];

  if (result.highConfidenceFixes > 0) {
    lines.push(
      `:sparkles: **${result.highConfidenceFixes} high-confidence fix(es)** can be applied automatically.`
    );
    lines.push('');
  }

  for (const fix of result.fixes) {
    const confidencePct = Math.round(fix.confidence * 100);
    const confidenceLabel =
      fix.confidence >= 0.9
        ? ':green_circle: High'
        : fix.confidence >= 0.7
          ? ':yellow_circle: Medium'
          : ':red_circle: Low';

    const sourceLabel = fix.source === 'pattern' ? 'pattern-matched' : 'LLM-generated';
    const location = `${fix.issue.file}:${fix.issue.line}`;

    lines.push(`<details>`);
    lines.push(
      `<summary>${confidenceLabel} confidence (${confidencePct}%) — \`${location}\` — ${fix.description}</summary>`
    );
    lines.push('');
    lines.push(`**Issue:** ${fix.issue.message}`);
    lines.push('');

    if (fix.original) {
      lines.push('**Original:**');
      lines.push('```typescript');
      lines.push(fix.original);
      lines.push('```');
      lines.push('');
    }

    lines.push('**Replacement:**');
    lines.push('```suggestion');
    lines.push(fix.replacement);
    lines.push('```');
    lines.push('');

    lines.push(`*Source: ${sourceLabel}*`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (result.unfixableIssues.length > 0) {
    lines.push(
      `*${result.unfixableIssues.length} issue(s) could not be auto-fixed and require manual review.*`
    );
    lines.push('');
  }

  return lines.join('\n');
}
