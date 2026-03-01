/**
 * Breaking Change Detection
 *
 * Compares current OpenAPI spec vs previous version (from baseline or git)
 * to detect breaking changes in the API.
 *
 * Breaking changes (errors):
 * - Removed endpoints
 * - Removed required fields
 * - Type changes
 * - Added required fields to request
 *
 * Non-breaking changes (info):
 * - Added optional fields
 * - New endpoints
 * - Added optional query parameters
 */
import type { ParsedSpec, HttpMethod } from './spec-parser';
/**
 * Type of breaking change
 */
export type BreakingChangeKind = 'endpoint-removed' | 'required-field-removed' | 'type-changed' | 'required-field-added-to-request' | 'parameter-removed' | 'required-parameter-added' | 'response-removed' | 'endpoint-added' | 'optional-field-added' | 'optional-parameter-added' | 'response-added' | 'field-made-optional';
/**
 * Severity based on change kind
 */
export type ChangeSeverity = 'error' | 'warning' | 'info';
/**
 * A detected change between spec versions
 */
export interface SpecChange {
    /** Type of change */
    kind: BreakingChangeKind;
    /** Severity level */
    severity: ChangeSeverity;
    /** Endpoint path */
    path: string;
    /** HTTP method */
    method?: HttpMethod;
    /** Field name if applicable */
    field?: string;
    /** Parameter name if applicable */
    parameter?: string;
    /** Human-readable message */
    message: string;
    /** What it was before */
    before?: string;
    /** What it is now */
    after?: string;
}
/**
 * Result of breaking change detection
 */
export interface BreakingChangeResult {
    /** All changes detected */
    changes: SpecChange[];
    /** Breaking changes count */
    breakingCount: number;
    /** Non-breaking changes count */
    nonBreakingCount: number;
    /** Whether there are any breaking changes */
    hasBreakingChanges: boolean;
    /** Human-readable summary */
    summary: string;
}
/**
 * Options for comparing specs
 */
export interface CompareOptions {
    /** Path to current (new) spec */
    currentSpecPath: string;
    /** Path to previous (baseline) spec */
    previousSpecPath?: string;
    /** Git ref to compare against (e.g., 'main', 'HEAD~1') */
    gitRef?: string;
    /** Root directory (for git operations) */
    rootDir?: string;
}
/**
 * Compare two OpenAPI specs
 */
export declare function compareSpecs(previous: ParsedSpec, current: ParsedSpec): BreakingChangeResult;
/**
 * Detect breaking changes between spec versions
 */
export declare function detectBreakingChanges(options: CompareOptions): BreakingChangeResult;
/**
 * Check for breaking changes in a directory
 */
export declare function checkBreakingChanges(rootDir: string, gitRef?: string): BreakingChangeResult;
/**
 * Format breaking changes as a report
 */
export declare function formatBreakingChangesReport(result: BreakingChangeResult): string;
//# sourceMappingURL=breaking-changes.d.ts.map