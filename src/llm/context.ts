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

import * as fs from 'fs';
import * as path from 'path';
import type { GateResult, Violation } from '../gates/types';
import type { ParsedSpec } from '../api/spec-parser';
import type { HawkyConfig } from '../config/types';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for text
 * Uses a simple heuristic: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a file
 */
export function estimateFileTokens(content: string): number {
  return estimateTokens(content);
}

// ============================================================================
// Diff Parsing
// ============================================================================

/**
 * Parse a unified diff string into structured data
 */
export function parseDiff(diffText: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: ChangedFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkContent: string[] = [];

  for (const line of lines) {
    // File header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      // Save previous file
      if (currentFile) {
        if (currentHunk) {
          currentHunk.content = hunkContent.join('\n');
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      // Parse file path
      const fileMatch = line.match(/diff --git a\/(.+) b\/(.+)/);
      const filePath = fileMatch && fileMatch[2] ? fileMatch[2] : '';

      currentFile = {
        path: filePath,
        status: 'modified',
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      hunkContent = [];
      continue;
    }

    if (!currentFile) continue;

    // File status
    if (line.startsWith('new file')) {
      currentFile.status = 'added';
    } else if (line.startsWith('deleted file')) {
      currentFile.status = 'deleted';
    } else if (line.startsWith('rename from')) {
      currentFile.status = 'renamed';
      const renameMatch = line.match(/rename from (.+)/);
      if (renameMatch && renameMatch[1]) {
        currentFile.previousPath = renameMatch[1];
      }
    }

    // Hunk header: @@ -1,5 +1,6 @@
    if (line.startsWith('@@')) {
      // Save previous hunk
      if (currentHunk) {
        currentHunk.content = hunkContent.join('\n');
        currentFile.hunks.push(currentHunk);
      }

      const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch && hunkMatch[1] && hunkMatch[3]) {
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || '1', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || '1', 10),
          content: '',
        };
        hunkContent = [];
      }
      continue;
    }

    // Hunk content
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      hunkContent.push(line);

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions++;
      }
    }
  }

  // Save last file
  if (currentFile) {
    if (currentHunk) {
      currentHunk.content = hunkContent.join('\n');
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Create a PRDiff from parsed files
 */
export function createPRDiff(
  base: string,
  head: string,
  files: ChangedFile[]
): PRDiff {
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    base,
    head,
    files,
    totalAdditions,
    totalDeletions,
  };
}

// ============================================================================
// File Content Loading
// ============================================================================

/**
 * Load file content with token estimation
 */
export function loadFileContent(
  filePath: string,
  rootDir: string
): FileContent | null {
  const fullPath = path.join(rootDir, filePath);

  try {
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const stats = fs.statSync(fullPath);

    // Skip very large files
    if (stats.size > 500000) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    return {
      path: filePath,
      content,
      size: stats.size,
      tokenCount: estimateFileTokens(content),
    };
  } catch {
    return null;
  }
}

/**
 * Load multiple file contents with budget
 */
export function loadFileContents(
  filePaths: string[],
  rootDir: string,
  maxTokens: number
): FileContent[] {
  const contents: FileContent[] = [];
  let totalTokens = 0;

  for (const filePath of filePaths) {
    if (totalTokens >= maxTokens) break;

    const content = loadFileContent(filePath, rootDir);
    if (content && totalTokens + content.tokenCount <= maxTokens) {
      contents.push(content);
      totalTokens += content.tokenCount;
    }
  }

  return contents;
}

// ============================================================================
// Prioritization
// ============================================================================

/**
 * Score a file for prioritization
 * Higher score = higher priority
 */
function scoreFile(file: ChangedFile, priorityPatterns: string[]): number {
  let score = 0;

  // More changes = higher priority
  score += file.additions + file.deletions;

  // Check priority patterns
  for (const pattern of priorityPatterns) {
    if (file.path.includes(pattern)) {
      score += 100;
    }
  }

  // Source files get priority over tests
  if (file.path.includes('test') || file.path.includes('spec')) {
    score -= 20;
  }

  // TypeScript/JavaScript files get priority
  if (file.path.endsWith('.ts') || file.path.endsWith('.tsx') ||
      file.path.endsWith('.js') || file.path.endsWith('.jsx')) {
    score += 10;
  }

  return score;
}

/**
 * Prioritize files for context inclusion
 */
export function prioritizeFiles(
  files: ChangedFile[],
  priorityPatterns: string[] = []
): ChangedFile[] {
  const scored = files.map((file) => ({
    file,
    score: scoreFile(file, priorityPatterns),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.file);
}

// ============================================================================
// Spec Summary
// ============================================================================

/**
 * Create a summary of the OpenAPI spec for context
 */
export function summarizeSpec(spec: ParsedSpec): string {
  const lines: string[] = [
    `API: ${spec.info.title} v${spec.info.version}`,
    '',
    'Endpoints:',
  ];

  for (const endpoint of spec.endpoints.slice(0, 20)) {
    lines.push(`- ${endpoint.method.toUpperCase()} ${endpoint.path}`);
  }

  if (spec.endpoints.length > 20) {
    lines.push(`... and ${spec.endpoints.length - 20} more endpoints`);
  }

  return lines.join('\n');
}

// ============================================================================
// Conventions
// ============================================================================

/**
 * Extract conventions from config
 */
export function extractConventions(config?: HawkyConfig): string[] {
  const conventions: string[] = [];

  if (!config) return conventions;

  // Gate-specific conventions
  if (config.gates.typescript.enabled) {
    conventions.push('TypeScript strict mode is enabled');
  }

  if (config.gates.eslint.enabled) {
    conventions.push('ESLint checks are enabled');
  }

  if (config.gates.semgrep.enabled) {
    conventions.push('Security scanning with Semgrep is enabled');
  }

  if (config.gates['design-system']?.enabled) {
    conventions.push('Design system enforcement is enabled');
    if (config.gates['design-system'].bannedClasses?.length) {
      conventions.push(
        `Banned CSS classes: ${config.gates['design-system'].bannedClasses.join(', ')}`
      );
    }
  }

  return conventions;
}

// ============================================================================
// Context Assembly
// ============================================================================

/**
 * Format diff for LLM consumption
 */
export function formatDiffForLLM(diff: PRDiff, maxTokens: number): string {
  const lines: string[] = [
    `## Changed Files (${diff.files.length} files, +${diff.totalAdditions}/-${diff.totalDeletions})`,
    '',
  ];

  let tokenCount = estimateTokens(lines.join('\n'));
  const fileTokenBudget = Math.floor((maxTokens - tokenCount) / Math.max(diff.files.length, 1));

  for (const file of diff.files) {
    const fileHeader = `### ${file.status.toUpperCase()}: ${file.path}`;
    lines.push(fileHeader);

    for (const hunk of file.hunks) {
      const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
      lines.push(hunkHeader);

      // Truncate hunk if needed
      const hunkTokens = estimateTokens(hunk.content);
      if (hunkTokens > fileTokenBudget) {
        const truncatedLines = hunk.content.split('\n').slice(0, 50);
        lines.push(truncatedLines.join('\n'));
        lines.push('... (truncated)');
      } else {
        lines.push(hunk.content);
      }
    }

    lines.push('');
    tokenCount = estimateTokens(lines.join('\n'));

    if (tokenCount > maxTokens) {
      lines.push('... (remaining files truncated)');
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Format violations for LLM consumption
 */
export function formatViolationsForLLM(violations: Violation[]): string {
  if (violations.length === 0) {
    return 'No violations from other gates.';
  }

  const lines: string[] = [
    `## Existing Violations (${violations.length})`,
    '',
  ];

  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = byFile.get(v.file) || [];
    existing.push(v);
    byFile.set(v.file, existing);
  }

  for (const [file, fileViolations] of byFile) {
    lines.push(`### ${file}`);
    for (const v of fileViolations.slice(0, 10)) {
      lines.push(`- Line ${v.line}: [${v.ruleId}] ${v.message}`);
    }
    if (fileViolations.length > 10) {
      lines.push(`... and ${fileViolations.length - 10} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format file contents for LLM consumption
 */
export function formatFileContentsForLLM(
  contents: FileContent[],
  maxTokens: number
): string {
  if (contents.length === 0) {
    return '';
  }

  const lines: string[] = ['## Full File Contents', ''];
  let tokenCount = estimateTokens(lines.join('\n'));

  for (const file of contents) {
    if (tokenCount + file.tokenCount > maxTokens) {
      lines.push(`... (${contents.length - contents.indexOf(file)} files omitted due to token limit)`);
      break;
    }

    lines.push(`### ${file.path}`);
    lines.push('```');
    lines.push(file.content);
    lines.push('```');
    lines.push('');

    tokenCount += file.tokenCount;
  }

  return lines.join('\n');
}

/**
 * Assemble full context for LLM review
 */
export function assembleContext(options: ContextOptions): ReviewContext {
  const warnings: string[] = [];
  let truncated = false;

  // Budget allocation (rough percentages)
  const diffBudget = Math.floor(options.maxTokens * 0.4);
  const filesBudget = Math.floor(options.maxTokens * 0.3);
  // violationsBudget reserved for future use
  const otherBudget = Math.floor(options.maxTokens * 0.15);

  // Extract violations from gate results
  const violations: Violation[] = [];
  if (options.gateResults) {
    for (const result of options.gateResults) {
      violations.push(...result.violations);
    }
  }

  // Format diff
  const diffText = formatDiffForLLM(options.diff, diffBudget);
  const diffTokens = estimateTokens(diffText);
  if (diffTokens >= diffBudget) {
    truncated = true;
    warnings.push('Diff was truncated to fit token budget');
  }

  // Load file contents if enabled
  let fileContents: FileContent[] = [];
  if (options.includeFullFiles) {
    const prioritized = prioritizeFiles(
      options.diff.files.filter((f) => f.status !== 'deleted'),
      options.priorityPatterns
    );
    const filePaths = prioritized.map((f) => f.path);
    fileContents = loadFileContents(filePaths, options.rootDir, filesBudget);
  }

  // Spec summary
  let specSummary: string | undefined;
  if (options.spec) {
    specSummary = summarizeSpec(options.spec);
    if (estimateTokens(specSummary) > otherBudget / 2) {
      specSummary = specSummary.slice(0, otherBudget * 2); // ~half budget in chars
      truncated = true;
      warnings.push('Spec summary was truncated');
    }
  }

  // Conventions
  const conventions = extractConventions(options.config);

  // Calculate total tokens
  let totalTokens = diffTokens;
  totalTokens += fileContents.reduce((sum, f) => sum + f.tokenCount, 0);
  totalTokens += estimateTokens(formatViolationsForLLM(violations.slice(0, 50)));
  if (specSummary) totalTokens += estimateTokens(specSummary);
  totalTokens += estimateTokens(conventions.join('\n'));

  const result: ReviewContext = {
    diff: options.diff,
    fileContents,
    violations: violations.slice(0, 100), // Limit violations
    conventions,
    totalTokens,
    truncated,
    warnings,
  };

  if (specSummary) {
    result.specSummary = specSummary;
  }

  return result;
}

/**
 * Format assembled context as a prompt
 */
export function formatContextAsPrompt(context: ReviewContext): string {
  const sections: string[] = [];

  // Diff section
  const diffText = formatDiffForLLM(context.diff, Infinity);
  sections.push(diffText);

  // Violations section
  if (context.violations.length > 0) {
    sections.push(formatViolationsForLLM(context.violations));
  }

  // File contents section
  if (context.fileContents.length > 0) {
    sections.push(formatFileContentsForLLM(context.fileContents, Infinity));
  }

  // Spec section
  if (context.specSummary) {
    sections.push('## API Specification', '', context.specSummary, '');
  }

  // Conventions section
  if (context.conventions.length > 0) {
    sections.push(
      '## Project Conventions',
      '',
      ...context.conventions.map((c) => `- ${c}`),
      ''
    );
  }

  return sections.join('\n');
}
