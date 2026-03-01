/**
 * Change Request Generation (S077)
 *
 * Generates actionable change requests from LLM findings.
 * Formats as GitHub review comments with inline code suggestions.
 *
 * Features:
 * - Converts ReviewIssues into GitHub pull_request review comment format
 * - Supports inline code suggestions (```suggestion blocks)
 * - Groups related changes for coherent review threads
 * - Prioritizes by severity
 */

import type { ReviewIssue } from './review';
import type { SpecComplianceResult } from './spec-compliance';

// ============================================================================
// Types
// ============================================================================

/**
 * A single GitHub review comment (inline comment on a PR diff)
 */
export interface ReviewComment {
  /** File path (relative to repo root) */
  path: string;

  /** Line number in the new file (for single-line comments) */
  line: number;

  /** Start line for multi-line comments */
  startLine?: number;

  /** Side of the diff ('RIGHT' = new file, 'LEFT' = old file) */
  side: 'RIGHT' | 'LEFT';

  /** Comment body in GitHub Flavored Markdown */
  body: string;
}

/**
 * A GitHub review — collection of comments plus an overall verdict
 */
export interface GitHubReview {
  /** Review body/summary (shown at top of review) */
  body: string;

  /** Review event type */
  event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE';

  /** Inline comments on the diff */
  comments: ReviewComment[];
}

/**
 * Options for change request generation
 */
export interface ChangeRequestOptions {
  /** Repository in "owner/repo" format */
  repository: string;

  /** PR head commit SHA (required for GitHub review comments) */
  commitSha: string;

  /** Whether to include code suggestions (```suggestion blocks) */
  includeSuggestions?: boolean;

  /** Minimum severity to generate comments for (default: 'warning') */
  minSeverity?: 'error' | 'warning' | 'info';

  /** Maximum number of inline comments (GitHub limit: 60 per review) */
  maxComments?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** GitHub's limit on inline review comments per review submission */
const GITHUB_MAX_REVIEW_COMMENTS = 60;

/** Severity ordering for filtering */
const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// ============================================================================
// Comment Body Builders
// ============================================================================

/**
 * Build a markdown comment body for a single ReviewIssue.
 * Includes severity badge, message, suggestion, and optional code suggestion.
 */
export function buildIssueCommentBody(
  issue: ReviewIssue,
  includeSuggestions: boolean
): string {
  const severityBadges = {
    error: ':red_circle: **Error**',
    warning: ':yellow_circle: **Warning**',
    info: ':blue_circle: **Suggestion**',
  };

  const badge = severityBadges[issue.severity];
  const lines: string[] = [];

  lines.push(`${badge}: ${issue.message}`);

  if (issue.suggestion) {
    if (includeSuggestions) {
      // Format as a GitHub code suggestion block
      lines.push('');
      lines.push('```suggestion');
      lines.push(issue.suggestion);
      lines.push('```');
    } else {
      lines.push('');
      lines.push(`**Suggestion:** ${issue.suggestion}`);
    }
  }

  if (issue.category) {
    lines.push('');
    lines.push(`*Category: \`${issue.category}\`*`);
  }

  return lines.join('\n');
}

/**
 * Build a comment body for an unmet spec requirement.
 */
export function buildComplianceCommentBody(
  requirementId: string,
  requirementDescription: string,
  explanation: string
): string {
  const lines = [
    `:x: **Spec Requirement Not Met: [${requirementId}]**`,
    '',
    `*Requirement:* ${requirementDescription}`,
    '',
    `*Assessment:* ${explanation}`,
    '',
    `*This requirement must be implemented before this PR can be merged.*`,
  ];

  return lines.join('\n');
}

// ============================================================================
// Review Comment Generation
// ============================================================================

/**
 * Convert a ReviewIssue to a GitHub review comment
 */
function issueToReviewComment(
  issue: ReviewIssue,
  options: ChangeRequestOptions
): ReviewComment | null {
  if (issue.line <= 0) {
    // Can't create inline comment without a valid line number
    return null;
  }

  const includeSuggestions = options.includeSuggestions ?? true;
  const body = buildIssueCommentBody(issue, includeSuggestions);

  return {
    path: issue.file,
    line: issue.line,
    side: 'RIGHT',
    body,
  };
}

/**
 * Generate the overall review summary body
 */
function buildReviewSummary(
  issues: ReviewIssue[],
  compliance?: SpecComplianceResult
): string {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  const lines: string[] = ['## Hawky AI Review'];
  lines.push('');

  const totalIssues = issues.length;
  const missedReqs = compliance?.missedRequirements.length ?? 0;

  if (totalIssues === 0 && missedReqs === 0) {
    lines.push(':white_check_mark: No issues found. Good to merge!');
    return lines.join('\n');
  }

  // Stats summary
  const statParts: string[] = [];
  if (errors.length > 0) statParts.push(`${errors.length} error(s)`);
  if (warnings.length > 0) statParts.push(`${warnings.length} warning(s)`);
  if (infos.length > 0) statParts.push(`${infos.length} suggestion(s)`);
  if (missedReqs > 0) statParts.push(`${missedReqs} unmet spec requirement(s)`);

  lines.push(`Found: ${statParts.join(', ')}`);
  lines.push('');

  if (errors.length > 0 || missedReqs > 0) {
    lines.push(':red_circle: **Changes required before merge.**');
  } else {
    lines.push(':yellow_circle: **Non-blocking issues found. Consider addressing them.**');
  }

  if (compliance && compliance.missedRequirements.length > 0) {
    lines.push('');
    lines.push('### Unmet Spec Requirements');
    lines.push('');
    for (const r of compliance.missedRequirements) {
      lines.push(`- **[${r.requirement.id}]** ${r.requirement.description}`);
      lines.push(`  > ${r.explanation}`);
    }
  }

  return lines.join('\n');
}

/**
 * Determine the review event based on issue severity
 */
function determineReviewEvent(
  issues: ReviewIssue[],
  compliance?: SpecComplianceResult
): 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE' {
  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasUnmetRequirements = (compliance?.missedRequirements.length ?? 0) > 0;

  if (issues.length === 0 && !hasUnmetRequirements) {
    return 'APPROVE';
  }

  if (hasErrors || hasUnmetRequirements) {
    return 'REQUEST_CHANGES';
  }

  return 'COMMENT';
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generate GitHub review change requests from LLM findings
 *
 * Converts ReviewIssues and spec compliance results into a structured
 * GitHub review with inline comments and an overall verdict.
 *
 * GitHub API usage:
 *   POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
 *   Body: { commit_id, body, event, comments }
 */
export function generateChangeRequests(
  issues: ReviewIssue[],
  options: ChangeRequestOptions,
  compliance?: SpecComplianceResult
): GitHubReview {
  const minSeverity = options.minSeverity ?? 'warning';
  const maxComments = Math.min(
    options.maxComments ?? GITHUB_MAX_REVIEW_COMMENTS,
    GITHUB_MAX_REVIEW_COMMENTS
  );
  const minSeverityOrder = SEVERITY_ORDER[minSeverity] ?? 1;

  // Filter issues by minimum severity
  const filteredIssues = issues
    .filter((i) => (SEVERITY_ORDER[i.severity] ?? 2) <= minSeverityOrder)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2));

  // Generate inline comments (skip issues with no valid line number)
  const comments: ReviewComment[] = [];

  for (const issue of filteredIssues) {
    if (comments.length >= maxComments) break;
    const comment = issueToReviewComment(issue, options);
    if (comment) {
      comments.push(comment);
    }
  }

  // Build the review
  const event = determineReviewEvent(issues, compliance);
  const body = buildReviewSummary(issues, compliance);

  return {
    body,
    event,
    comments,
  };
}

/**
 * Format a list of change requests as a standalone markdown summary
 * (for use in step summaries or PR comment bodies when API isn't available)
 */
export function formatChangeRequestsAsMarkdown(review: GitHubReview): string {
  const lines: string[] = [];

  lines.push(review.body);
  lines.push('');

  if (review.comments.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push(`### Inline Comments (${review.comments.length})`);
    lines.push('');

    for (const comment of review.comments) {
      lines.push(`**\`${comment.path}:${comment.line}\`**`);
      lines.push('');
      // Indent comment body
      for (const bodyLine of comment.body.split('\n')) {
        lines.push(`> ${bodyLine}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
