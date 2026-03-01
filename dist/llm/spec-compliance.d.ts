/**
 * Spec Compliance Analysis (S075)
 *
 * Analyzes code changes against spec/acceptance criteria using LLM.
 * Checks if implementation matches requirements and reports:
 * - Compliance score (0-1)
 * - Specific mismatches between spec and implementation
 */
import type { LLMClient } from './provider';
import type { ReviewContext } from './context';
/**
 * A single spec requirement
 */
export interface SpecRequirement {
    /** Unique identifier (e.g., "AC-1", "req-auth-01") */
    id: string;
    /** Human-readable description */
    description: string;
    /** Source: where this came from (story title, section, etc.) */
    source?: string;
}
/**
 * Result of checking one requirement against the implementation
 */
export interface RequirementCheckResult {
    /** The requirement that was checked */
    requirement: SpecRequirement;
    /** Whether the requirement is met */
    met: boolean;
    /** How confident the LLM is (0-1) */
    confidence: number;
    /** Explanation of why it's met or not */
    explanation: string;
    /** Specific files/lines where the mismatch occurs */
    locations?: Array<{
        file: string;
        line: number;
        note: string;
    }>;
}
/**
 * Full spec compliance result
 */
export interface SpecComplianceResult {
    /** Overall compliance score (0-1): fraction of requirements met */
    complianceScore: number;
    /** Per-requirement results */
    requirementResults: RequirementCheckResult[];
    /** Requirements that are clearly met */
    metRequirements: RequirementCheckResult[];
    /** Requirements that are not met or partially met */
    missedRequirements: RequirementCheckResult[];
    /** Overall confidence in the analysis (0-1) */
    overallConfidence: number;
    /** Human-readable summary */
    summary: string;
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
 * Options for spec compliance analysis
 */
export interface SpecComplianceOptions {
    /** LLM client to use */
    client: LLMClient;
    /** Review context (diff, file contents) */
    context: ReviewContext;
    /** Spec requirements to check against */
    requirements: SpecRequirement[];
    /** Story/feature description (full text) */
    storyDescription?: string;
    /** Additional acceptance criteria text */
    acceptanceCriteria?: string;
    /** Include raw LLM response in result */
    includeRawResponse?: boolean;
}
/**
 * Analyze code changes for spec compliance
 *
 * Returns a compliance score and per-requirement results showing
 * which acceptance criteria are met by the implementation.
 */
export declare function analyzeSpecCompliance(options: SpecComplianceOptions): Promise<SpecComplianceResult>;
/**
 * Parse acceptance criteria text into structured requirements
 *
 * Supports common formats:
 * - "- [ ] AC-1: Description" (GitHub checklist)
 * - "- AC-1: Description" (plain list)
 * - "1. Description" (numbered list)
 * - "Description" (plain text, one per line)
 */
export declare function parseAcceptanceCriteria(text: string): SpecRequirement[];
/**
 * Format spec compliance result as markdown for PR comments
 */
export declare function formatComplianceAsMarkdown(result: SpecComplianceResult): string;
//# sourceMappingURL=spec-compliance.d.ts.map