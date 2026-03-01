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
import type { LLMClient } from './provider';
import type { ReviewIssue } from './review';
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
/**
 * Generate auto-fix suggestions for a list of review issues
 *
 * Strategy:
 * 1. Try pattern-based fixes first (fast, no LLM cost)
 * 2. For unfixed issues, optionally call LLM for complex fixes
 * 3. Filter by minConfidence threshold
 * 4. Return fixes sorted by confidence (highest first)
 */
export declare function generateAutoFixes(issues: ReviewIssue[], options?: AutoFixOptions): Promise<AutoFixResult>;
/**
 * Format auto-fix suggestions as markdown for inclusion in PR comments
 */
export declare function formatAutoFixesAsMarkdown(result: AutoFixResult): string;
//# sourceMappingURL=auto-fix.d.ts.map