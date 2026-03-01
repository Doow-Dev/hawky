/**
 * Semantic Review Engine
 *
 * Core LLM review that produces structured output.
 * Uses the assembled context to generate code review feedback.
 */

import type { LLMClient, ChatMessage } from './provider';
import type { ReviewContext } from './context';
import { formatContextAsPrompt } from './context';

// ============================================================================
// Types
// ============================================================================

/**
 * Severity of a review issue
 */
export type ReviewSeverity = 'error' | 'warning' | 'info';

/**
 * A single issue found by the LLM review
 */
export interface ReviewIssue {
  /** File path where issue was found */
  file: string;

  /** Line number (1-indexed, 0 if unknown) */
  line: number;

  /** Issue severity */
  severity: ReviewSeverity;

  /** Human-readable message */
  message: string;

  /** Suggested fix (if available) */
  suggestion?: string;

  /** Category of the issue */
  category?: string;
}

/**
 * Result of LLM review
 */
export interface LLMReviewResult {
  /** All issues found */
  issues: ReviewIssue[];

  /** Overall summary of the review */
  summary: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Token usage */
  inputTokens: number;
  outputTokens: number;

  /** Cost in USD */
  cost: number;

  /** Latency in ms */
  latencyMs: number;

  /** Raw LLM response (for debugging) */
  rawResponse?: string;
}

/**
 * Options for the review
 */
export interface ReviewOptions {
  /** LLM client to use */
  client: LLMClient;

  /** Assembled context */
  context: ReviewContext;

  /** Focus areas for the review */
  focusAreas?: string[];

  /** Maximum issues to return */
  maxIssues?: number;

  /** Include raw response in result */
  includeRawResponse?: boolean;
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * System prompt for code review
 */
const SYSTEM_PROMPT = `You are an expert code reviewer for a TypeScript/JavaScript project. Your job is to review code changes and identify issues.

Focus on:
- Security vulnerabilities
- Performance issues
- Type safety concerns
- API contract violations
- Code quality and maintainability
- Best practices

For each issue, provide:
- The file and line number
- Severity: error (must fix), warning (should fix), info (suggestion)
- A clear description of the issue
- A suggestion for how to fix it (if applicable)

IMPORTANT: Respond ONLY with valid JSON in the exact format specified. Do not include any other text.`;

/**
 * User prompt template
 */
function buildUserPrompt(
  context: ReviewContext,
  focusAreas?: string[]
): string {
  const contextPrompt = formatContextAsPrompt(context);

  const focusSection = focusAreas?.length
    ? `\n\n## Focus Areas\nPay special attention to:\n${focusAreas.map((a) => `- ${a}`).join('\n')}`
    : '';

  return `Please review the following code changes and provide feedback.
${focusSection}

${contextPrompt}

Respond with a JSON object in this exact format:
{
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "error" | "warning" | "info",
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)",
      "category": "security" | "performance" | "type-safety" | "api-contract" | "code-quality" | "other"
    }
  ],
  "summary": "Overall assessment of the changes",
  "confidence": 0.85
}

If there are no issues, return an empty issues array with a positive summary.`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse LLM response into structured result
 */
export function parseReviewResponse(response: string): {
  issues: ReviewIssue[];
  summary: string;
  confidence: number;
} {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Handle markdown code blocks
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match && match[1]) {
        jsonStr = match[1].trim();
      }
    }

    const parsed = JSON.parse(jsonStr) as {
      issues?: Array<{
        file?: string;
        line?: number;
        severity?: string;
        message?: string;
        suggestion?: string;
        category?: string;
      }>;
      summary?: string;
      confidence?: number;
    };

    // Validate and normalize issues
    const issues: ReviewIssue[] = [];
    if (Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        if (!issue.file || !issue.message) continue;

        const severity = ['error', 'warning', 'info'].includes(
          issue.severity || ''
        )
          ? (issue.severity as ReviewSeverity)
          : 'warning';

        const reviewIssue: ReviewIssue = {
          file: issue.file,
          line: issue.line || 0,
          severity,
          message: issue.message,
        };

        if (issue.suggestion) {
          reviewIssue.suggestion = issue.suggestion;
        }
        if (issue.category) {
          reviewIssue.category = issue.category;
        }

        issues.push(reviewIssue);
      }
    }

    return {
      issues,
      summary: parsed.summary || 'No summary provided.',
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
    };
  } catch {
    // If JSON parsing fails, try to extract issues from text
    return {
      issues: [],
      summary: 'Failed to parse LLM response. Raw response may contain useful information.',
      confidence: 0,
    };
  }
}

// ============================================================================
// Main Review Function
// ============================================================================

/**
 * Run LLM code review
 */
export async function runReview(options: ReviewOptions): Promise<LLMReviewResult> {
  const { client, context, focusAreas, maxIssues = 50, includeRawResponse = false } = options;

  // Build messages
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(context, focusAreas) },
  ];

  // Make LLM request with temperature=0 for deterministic output (per spec S074/S079)
  const response = await client.chat(messages, { temperature: 0 });

  // Parse response
  const parsed = parseReviewResponse(response.content);

  // Limit issues
  const issues = parsed.issues.slice(0, maxIssues);

  const result: LLMReviewResult = {
    issues,
    summary: parsed.summary,
    confidence: parsed.confidence,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cost: response.cost,
    latencyMs: response.latencyMs,
  };

  if (includeRawResponse) {
    result.rawResponse = response.content;
  }

  return result;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format review result as markdown
 */
export function formatReviewAsMarkdown(result: LLMReviewResult): string {
  const lines: string[] = ['# LLM Code Review', ''];

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(result.summary);
  lines.push('');

  // Stats
  lines.push(`**Confidence:** ${Math.round(result.confidence * 100)}%`);
  lines.push(`**Issues Found:** ${result.issues.length}`);
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('No issues found.');
    return lines.join('\n');
  }

  // Group issues by severity
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  const infos = result.issues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const issue of errors) {
      formatIssue(issue, lines);
    }
  }

  if (warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const issue of warnings) {
      formatIssue(issue, lines);
    }
  }

  if (infos.length > 0) {
    lines.push('## Suggestions');
    lines.push('');
    for (const issue of infos) {
      formatIssue(issue, lines);
    }
  }

  return lines.join('\n');
}

/**
 * Format a single issue
 */
function formatIssue(issue: ReviewIssue, lines: string[]): void {
  const location = issue.line > 0 ? `${issue.file}:${issue.line}` : issue.file;
  lines.push(`### ${location}`);
  lines.push('');
  lines.push(issue.message);

  if (issue.suggestion) {
    lines.push('');
    lines.push(`**Suggestion:** ${issue.suggestion}`);
  }

  if (issue.category) {
    lines.push('');
    lines.push(`*Category: ${issue.category}*`);
  }

  lines.push('');
}

/**
 * Convert review issues to gate violations
 */
export function reviewIssuesToViolations(
  issues: ReviewIssue[],
  gate: 'llm-review'
): Array<{
  ruleId: string;
  file: string;
  line: number;
  message: string;
  gate: string;
  severity: 'error' | 'warning';
}> {
  return issues.map((issue) => ({
    ruleId: issue.category ? `llm-${issue.category}` : 'llm-review',
    file: issue.file,
    line: issue.line,
    message: issue.message,
    gate,
    severity: issue.severity === 'error' ? 'error' : 'warning',
  }));
}
