/**
 * Auto-Label Based on Scope (S052)
 *
 * Determines which GitHub labels should be applied to a PR based on
 * the files it touches. Maps file path patterns to label names.
 *
 * Does not directly call GitHub API — returns a list of labels to apply.
 * The caller is responsible for applying them via the Octokit client.
 *
 * Output: INFORM tier (informational label application).
 */
/**
 * A mapping from file path patterns to a GitHub label
 */
export interface LabelRule {
    /** Human-readable name for this rule */
    name: string;
    /** File path patterns that trigger this label */
    patterns: RegExp[];
    /** Label to apply */
    label: string;
    /** Optional: description of what this label means */
    description?: string;
}
/**
 * A label that was matched, with context
 */
export interface MatchedLabel {
    /** The GitHub label name */
    label: string;
    /** Name of the rule that matched */
    ruleName: string;
    /** Files that triggered this label */
    triggerFiles: string[];
}
/**
 * Result of auto-label computation
 */
export interface AutoLabelResult {
    /** All labels to apply */
    labelsToApply: string[];
    /** Detailed match information */
    matchedLabels: MatchedLabel[];
    /** Files that were not covered by any rule */
    unmatchedFiles: string[];
    /** Summary message */
    message: string;
}
/**
 * Options for auto-label computation
 */
export interface AutoLabelOptions {
    /** Files changed in the PR */
    changedFiles: string[];
    /** Branch name (used for additional context) */
    branchName?: string;
    /** Label rules to apply (uses defaults if not provided) */
    rules?: LabelRule[];
}
/**
 * Default label rules for a typical full-stack project
 */
export declare const DEFAULT_LABEL_RULES: LabelRule[];
/**
 * Check if a file matches any of a rule's patterns
 */
export declare function fileMatchesRule(filePath: string, rule: LabelRule): boolean;
/**
 * Find which files triggered a specific rule
 */
export declare function findTriggerFiles(files: string[], rule: LabelRule): string[];
/**
 * Compute which labels should be applied to a PR based on changed files.
 * Pure function — no API calls.
 */
export declare function computeAutoLabels(options: AutoLabelOptions): AutoLabelResult;
export { computeAutoLabels as default };
//# sourceMappingURL=auto-label.d.ts.map