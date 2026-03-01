/**
 * Context Assembly Pipeline
 *
 * Gathers context for LLM code review:
 * - PR diff (changed files, hunks)
 * - Full file contents for context
 * - Gate violations from other gates
 * - OpenAPI spec (if exists)
 * - Project conventions (.hawky.yml settings)
 *
 * Features:
 * - Token budget management
 * - Prioritization of most relevant context
 * - Truncation strategies
 */
import type { GateResult, Violation } from '../gates/types';
import type { ParsedSpec } from '../api/spec-parser';
import type { HawkyConfig } from '../config/types';
/**
 * A file diff hunk
 */
export interface DiffHunk {
    /** Starting line in old file */
    oldStart: number;
    /** Number of lines in old file */
    oldLines: number;
    /** Starting line in new file */
    newStart: number;
    /** Number of lines in new file */
    newLines: number;
    /** The diff content (with +/- prefixes) */
    content: string;
}
/**
 * A changed file in the PR
 */
export interface ChangedFile {
    /** File path */
    path: string;
    /** Change type */
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    /** Previous path (if renamed) */
    previousPath?: string;
    /** Diff hunks */
    hunks: DiffHunk[];
    /** Number of additions */
    additions: number;
    /** Number of deletions */
    deletions: number;
}
/**
 * Full PR diff
 */
export interface PRDiff {
    /** Base branch/ref */
    base: string;
    /** Head branch/ref */
    head: string;
    /** All changed files */
    files: ChangedFile[];
    /** Total additions */
    totalAdditions: number;
    /** Total deletions */
    totalDeletions: number;
}
/**
 * File content with metadata
 */
export interface FileContent {
    /** File path */
    path: string;
    /** Full file content */
    content: string;
    /** File size in bytes */
    size: number;
    /** Estimated token count */
    tokenCount: number;
}
/**
 * Assembled context for LLM review
 */
export interface ReviewContext {
    /** PR diff summary */
    diff: PRDiff;
    /** Full file contents (for context) */
    fileContents: FileContent[];
    /** Violations from other gates */
    violations: Violation[];
    /** OpenAPI spec summary (if available) */
    specSummary?: string;
    /** Project conventions */
    conventions: string[];
    /** Total estimated tokens */
    totalTokens: number;
    /** Whether context was truncated */
    truncated: boolean;
    /** Truncation warnings */
    warnings: string[];
}
/**
 * Options for context assembly
 */
export interface ContextOptions {
    /** Root directory */
    rootDir: string;
    /** PR diff data */
    diff: PRDiff;
    /** Gate results (for violations) */
    gateResults?: GateResult[];
    /** Parsed OpenAPI spec (if available) */
    spec?: ParsedSpec;
    /** Hawky config */
    config?: HawkyConfig;
    /** Maximum tokens to include */
    maxTokens: number;
    /** Whether to include full file contents */
    includeFullFiles: boolean;
    /** File patterns to prioritize */
    priorityPatterns?: string[];
}
/**
 * Estimate token count for text
 * Uses a simple heuristic: ~4 characters per token
 */
export declare function estimateTokens(text: string): number;
/**
 * Estimate tokens for a file
 */
export declare function estimateFileTokens(content: string): number;
/**
 * Parse a unified diff string into structured data
 */
export declare function parseDiff(diffText: string): ChangedFile[];
/**
 * Create a PRDiff from parsed files
 */
export declare function createPRDiff(base: string, head: string, files: ChangedFile[]): PRDiff;
/**
 * Load file content with token estimation
 */
export declare function loadFileContent(filePath: string, rootDir: string): FileContent | null;
/**
 * Load multiple file contents with budget
 */
export declare function loadFileContents(filePaths: string[], rootDir: string, maxTokens: number): FileContent[];
/**
 * Prioritize files for context inclusion
 */
export declare function prioritizeFiles(files: ChangedFile[], priorityPatterns?: string[]): ChangedFile[];
/**
 * Create a summary of the OpenAPI spec for context
 */
export declare function summarizeSpec(spec: ParsedSpec): string;
/**
 * Extract conventions from config
 */
export declare function extractConventions(config?: HawkyConfig): string[];
/**
 * Format diff for LLM consumption
 */
export declare function formatDiffForLLM(diff: PRDiff, maxTokens: number): string;
/**
 * Format violations for LLM consumption
 */
export declare function formatViolationsForLLM(violations: Violation[]): string;
/**
 * Format file contents for LLM consumption
 */
export declare function formatFileContentsForLLM(contents: FileContent[], maxTokens: number): string;
/**
 * Assemble full context for LLM review
 */
export declare function assembleContext(options: ContextOptions): ReviewContext;
/**
 * Format assembled context as a prompt
 */
export declare function formatContextAsPrompt(context: ReviewContext): string;
//# sourceMappingURL=context.d.ts.map