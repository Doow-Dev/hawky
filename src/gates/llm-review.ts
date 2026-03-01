/**
 * LLM Review Gate
 *
 * Integrates the LLM semantic review into the Hawky gate system.
 */

import type { Gate, GateResult, GateRunOptions, Annotation, Violation } from './types';
import type { LLMClient } from '../llm/provider';
import type { PRDiff } from '../llm/context';
import { assembleContext, type ContextOptions } from '../llm/context';
import { runReview, reviewIssuesToViolations, type ReviewIssue } from '../llm/review';
import type { AnnotationSeverity } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the LLM review gate
 */
export interface LLMReviewGateOptions {
  /** LLM client to use */
  client: LLMClient;

  /** PR diff data */
  diff: PRDiff;

  /** Maximum tokens for context */
  maxTokens?: number;

  /** Whether to include full file contents */
  includeFullFiles?: boolean;

  /** Focus areas for the review */
  focusAreas?: string[];

  /** Minimum confidence to report issues */
  minConfidence?: number;
}

// ============================================================================
// Gate Implementation
// ============================================================================

/**
 * Convert review issues to annotations
 */
function issuesToAnnotations(issues: ReviewIssue[]): Annotation[] {
  return issues.map((issue) => {
    // Map 'info' to 'notice' for AnnotationSeverity
    let severity: AnnotationSeverity = 'warning';
    if (issue.severity === 'error') {
      severity = 'error';
    } else if (issue.severity === 'info') {
      severity = 'notice';
    }

    return {
      file: issue.file,
      line: issue.line || 1,
      message: issue.message,
      severity,
      ruleId: issue.category ? `llm-${issue.category}` : 'llm-review',
      title: issue.category || 'LLM Review',
    };
  });
}

/**
 * Run the LLM review gate
 */
export async function runLLMReviewGate(
  options: LLMReviewGateOptions,
  runOptions: GateRunOptions
): Promise<GateResult> {
  const startTime = Date.now();

  try {
    // Assemble context
    const contextOptions: ContextOptions = {
      rootDir: runOptions.cwd,
      diff: options.diff,
      maxTokens: options.maxTokens || 8000,
      includeFullFiles: options.includeFullFiles ?? true,
    };

    const context = assembleContext(contextOptions);

    // Run review
    const reviewOptions: Parameters<typeof runReview>[0] = {
      client: options.client,
      context,
    };
    if (options.focusAreas) {
      reviewOptions.focusAreas = options.focusAreas;
    }
    const result = await runReview(reviewOptions);

    // Check confidence threshold
    const minConfidence = options.minConfidence ?? 0.5;
    if (result.confidence < minConfidence) {
      return {
        gate: 'llm-review', // Cast needed as llm-review isn't in GateName yet
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `LLM review skipped (confidence ${Math.round(result.confidence * 100)}% below threshold ${Math.round(minConfidence * 100)}%)`,
      };
    }

    // Convert to gate format
    const annotations = issuesToAnnotations(result.issues);
    const violations = reviewIssuesToViolations(result.issues, 'llm-review');

    const errorCount = result.issues.filter((i) => i.severity === 'error').length;
    const status = errorCount > 0 ? 'fail' : 'pass';

    return {
      gate: 'llm-review',
      status,
      totalViolations: result.issues.length,
      newViolations: result.issues.length,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: runOptions.createAnnotations ? annotations : [],
      violations: violations as Violation[],
      timeMs: Date.now() - startTime,
      message: `LLM review: ${result.issues.length} issues found (${errorCount} errors). ${result.summary}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      gate: 'llm-review',
      status: 'error',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: Date.now() - startTime,
      message: `LLM review failed: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Create a Gate object for LLM review
 */
export function createLLMReviewGate(
  getOptions: () => Promise<LLMReviewGateOptions | null>
): Gate {
  return {
    name: 'llm-review',
    displayName: 'LLM Code Review',

    async canRun(): Promise<boolean> {
      const options = await getOptions();
      return options !== null;
    },

    async run(runOptions: GateRunOptions): Promise<GateResult> {
      const options = await getOptions();

      if (!options) {
        return {
          gate: 'llm-review',
          status: 'skip',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: 0,
          message: 'LLM review skipped (no LLM client configured)',
        };
      }

      return runLLMReviewGate(options, runOptions);
    },
  };
}
