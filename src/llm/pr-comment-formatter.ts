/**
 * PR Comment Formatter (S076)
 *
 * Formats LLM review findings as clean GitHub PR comments.
 * Features:
 * - Proper markdown with collapsible sections
 * - GitHub line links for inline navigation
 * - Integration with the existing Hawky report system
 * - Severity-based grouping and icons
 */

import type { LLMReviewResult, ReviewIssue } from './review';
import type { SpecComplianceResult } from './spec-compliance';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for formatting an LLM PR comment
 */
export interface LLMCommentOptions {
  /** Repository in "owner/repo" format — used for GitHub line links */
  repository: string;

  /** PR head commit SHA — used for GitHub line links */
  commitSha: string;

  /** PR number */
  prNumber: number;

  /** Whether to include collapsible sections (default: true) */
  includeDetails?: boolean;

  /** Whether to include timing and cost info (default: false) */
  includeMetadata?: boolean;

  /** Maximum issues to show per severity bucket before collapsing (default: 5) */
  maxIssuesPerSection?: number;
}

/**
 * Combined LLM findings for a PR comment
 */
export interface LLMFindings {
  /** Core review result */
  review?: LLMReviewResult;

  /** Spec compliance result (optional) */
  compliance?: SpecComplianceResult;
}

/**
 * Result of generating a PR comment
 */
export interface LLMCommentResult {
  /** Generated markdown */
  body: string;

  /** Number of errors in comment */
  errorCount: number;

  /** Number of warnings in comment */
  warningCount: number;

  /** Number of info/suggestions in comment */
  infoCount: number;

  /** Whether any blocking issues were found */
  hasBlockingIssues: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Marker used to identify Hawky LLM comments for updates */
export const LLM_COMMENT_MARKER = '<!-- hawky-llm-review -->';

/** Severity icons */
const SEVERITY_ICONS = {
  error: ':red_circle:',
  warning: ':yellow_circle:',
  info: ':blue_circle:',
} as const;

/** Severity display labels */
const SEVERITY_LABELS = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Suggestions',
} as const;

// ============================================================================
// Line Link Generation
// ============================================================================

/**
 * Generate a GitHub permalink to a specific file and line.
 *
 * Format: https://github.com/owner/repo/blob/{sha}/{file}#L{line}
 */
export function generateGitHubLineLink(
  repository: string,
  commitSha: string,
  file: string,
  line: number
): string {
  if (!repository || !commitSha || !file) return '';
  const lineFragment = line > 0 ? `#L${line}` : '';
  return `https://github.com/${repository}/blob/${commitSha}/${file}${lineFragment}`;
}

/**
 * Format a file+line reference with an optional GitHub link
 */
function formatFileRef(
  file: string,
  line: number,
  repository: string,
  commitSha: string
): string {
  const label = line > 0 ? `${file}:${line}` : file;
  const link = generateGitHubLineLink(repository, commitSha, file, line);
  return link ? `[\`${label}\`](${link})` : `\`${label}\``;
}

// ============================================================================
// Issue Grouping and Formatting
// ============================================================================

/**
 * Group review issues by severity
 */
function groupBySeverity(issues: ReviewIssue[]): {
  errors: ReviewIssue[];
  warnings: ReviewIssue[];
  infos: ReviewIssue[];
} {
  return {
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    infos: issues.filter((i) => i.severity === 'info'),
  };
}

/**
 * Format a single issue as markdown
 */
function formatIssue(
  issue: ReviewIssue,
  options: LLMCommentOptions
): string {
  const { repository, commitSha } = options;
  const lines: string[] = [];

  const icon = SEVERITY_ICONS[issue.severity];
  const location = formatFileRef(issue.file, issue.line, repository, commitSha);

  lines.push(`${icon} **${location}** — ${issue.message}`);

  if (issue.suggestion) {
    lines.push(`   > **Suggestion:** ${issue.suggestion}`);
  }

  if (issue.category) {
    lines.push(`   > *Category: \`${issue.category}\`*`);
  }

  return lines.join('\n');
}

/**
 * Format a section of issues (errors, warnings, or infos)
 */
function formatIssueSection(
  label: string,
  icon: string,
  issues: ReviewIssue[],
  options: LLMCommentOptions,
  maxVisible: number
): string {
  if (issues.length === 0) return '';

  const includeDetails = options.includeDetails !== false;
  const lines: string[] = [];

  const visibleIssues = issues.slice(0, maxVisible);
  const overflowCount = issues.length - visibleIssues.length;

  if (includeDetails) {
    lines.push(`<details open>`);
    lines.push(`<summary>${icon} **${label}** (${issues.length})</summary>`);
    lines.push('');
  } else {
    lines.push(`### ${icon} ${label} (${issues.length})`);
    lines.push('');
  }

  for (const issue of visibleIssues) {
    lines.push(formatIssue(issue, options));
    lines.push('');
  }

  if (overflowCount > 0) {
    lines.push(`*...and ${overflowCount} more. See the [workflow run](https://github.com/${options.repository}) for full details.*`);
    lines.push('');
  }

  if (includeDetails) {
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Review Section Formatting
// ============================================================================

/**
 * Format the LLM review result section
 */
function formatReviewSection(
  review: LLMReviewResult,
  options: LLMCommentOptions
): string {
  const maxPerSection = options.maxIssuesPerSection ?? 5;
  const { errors, warnings, infos } = groupBySeverity(review.issues);

  const lines: string[] = [];

  // Summary line
  const confidencePct = Math.round(review.confidence * 100);
  lines.push(`> ${review.summary}`);
  lines.push(`> *LLM Confidence: ${confidencePct}%*`);
  lines.push('');

  if (review.issues.length === 0) {
    lines.push(':white_check_mark: No issues found by LLM review.');
    lines.push('');
    return lines.join('\n');
  }

  // Errors
  const errorsSection = formatIssueSection(
    SEVERITY_LABELS.error,
    SEVERITY_ICONS.error,
    errors,
    options,
    maxPerSection
  );
  if (errorsSection) lines.push(errorsSection);

  // Warnings
  const warningsSection = formatIssueSection(
    SEVERITY_LABELS.warning,
    SEVERITY_ICONS.warning,
    warnings,
    options,
    maxPerSection
  );
  if (warningsSection) lines.push(warningsSection);

  // Infos
  const infosSection = formatIssueSection(
    SEVERITY_LABELS.info,
    SEVERITY_ICONS.info,
    infos,
    options,
    maxPerSection
  );
  if (infosSection) lines.push(infosSection);

  return lines.join('\n');
}

// ============================================================================
// Compliance Section Formatting
// ============================================================================

/**
 * Format the spec compliance section
 */
function formatComplianceSection(
  compliance: SpecComplianceResult,
  _options: LLMCommentOptions
): string {
  const scorePercent = Math.round(compliance.complianceScore * 100);
  const scoreIcon =
    compliance.complianceScore >= 0.9
      ? ':white_check_mark:'
      : compliance.complianceScore >= 0.7
        ? ':warning:'
        : ':x:';

  const lines: string[] = [];

  lines.push(
    `${scoreIcon} **Spec Compliance: ${scorePercent}%** (${compliance.metRequirements.length}/${compliance.requirementResults.length} requirements met)`
  );
  lines.push('');

  if (compliance.missedRequirements.length > 0) {
    lines.push('<details>');
    lines.push('<summary>:x: Unmet Requirements</summary>');
    lines.push('');

    for (const r of compliance.missedRequirements) {
      lines.push(`**[${r.requirement.id}]** ${r.requirement.description}`);
      lines.push('');
      lines.push(`> ${r.explanation}`);
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Main Comment Generator
// ============================================================================

/**
 * Generate a formatted PR comment for LLM findings
 *
 * Produces a clean, structured GitHub PR comment with:
 * - Overall status summary
 * - Collapsible error/warning/info sections with GitHub line links
 * - Optional spec compliance section
 * - Metadata (confidence, cost) if requested
 */
export function formatLLMComment(
  findings: LLMFindings,
  options: LLMCommentOptions
): LLMCommentResult {
  const { review, compliance } = findings;

  const lines: string[] = [];

  // Hidden marker (first line, invisible in rendered GitHub markdown)
  lines.push(LLM_COMMENT_MARKER);
  lines.push('');

  // Header
  lines.push('## :robot: Hawky AI Review');
  lines.push('');

  // Counters
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  // Review section
  if (review) {
    const { errors, warnings, infos } = groupBySeverity(review.issues);
    errorCount = errors.length;
    warningCount = warnings.length;
    infoCount = infos.length;

    lines.push('### Code Review');
    lines.push('');
    lines.push(formatReviewSection(review, options));
  }

  // Compliance section
  if (compliance) {
    lines.push('### Spec Compliance');
    lines.push('');
    lines.push(formatComplianceSection(compliance, options));
  }

  // Metadata section (optional)
  if (options.includeMetadata && (review || compliance)) {
    lines.push('<details>');
    lines.push('<summary>:chart_with_upwards_trend: Review Metadata</summary>');
    lines.push('');

    if (review) {
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| LLM Confidence | ${Math.round(review.confidence * 100)}% |`);
      lines.push(`| Input Tokens | ${review.inputTokens.toLocaleString()} |`);
      lines.push(`| Output Tokens | ${review.outputTokens.toLocaleString()} |`);
      lines.push(`| Cost | $${review.cost.toFixed(4)} |`);
      lines.push(`| Latency | ${review.latencyMs}ms |`);
    }

    if (compliance) {
      if (review) lines.push('');
      lines.push(`| Compliance Metric | Value |`);
      lines.push(`|-------------------|-------|`);
      lines.push(`| Requirements Checked | ${compliance.requirementResults.length} |`);
      lines.push(`| Confidence | ${Math.round(compliance.overallConfidence * 100)}% |`);
    }

    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(
    `*Hawky AI Review | Commit: \`${options.commitSha.slice(0, 7)}\`*`
  );

  const hasBlockingIssues = errorCount > 0;

  return {
    body: lines.join('\n'),
    errorCount,
    warningCount,
    infoCount,
    hasBlockingIssues,
  };
}

// ============================================================================
// Badge Generation
// ============================================================================

/**
 * Generate an overall status badge for the LLM review
 */
export function generateLLMStatusBadge(result: LLMCommentResult): string {
  if (result.errorCount > 0) {
    return `:x: **AI Review: ${result.errorCount} error(s) found** — Fix before merging`;
  }
  if (result.warningCount > 0) {
    return `:warning: **AI Review: ${result.warningCount} warning(s)** — Consider addressing`;
  }
  return ':white_check_mark: **AI Review: No issues found**';
}
