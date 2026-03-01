/**
 * LLM Review Gate
 *
 * Integrates the LLM semantic review into the Hawky gate system.
 */
import type { Gate, GateResult, GateRunOptions } from './types';
import type { LLMClient } from '../llm/provider';
import type { PRDiff } from '../llm/context';
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
/**
 * Run the LLM review gate
 */
export declare function runLLMReviewGate(options: LLMReviewGateOptions, runOptions: GateRunOptions): Promise<GateResult>;
/**
 * Create a Gate object for LLM review
 */
export declare function createLLMReviewGate(getOptions: () => Promise<LLMReviewGateOptions | null>): Gate;
//# sourceMappingURL=llm-review.d.ts.map