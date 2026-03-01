/**
 * PR Comment Reporter
 *
 * Generates markdown summary of gate results and posts as a PR comment.
 * Updates existing Hawky comment instead of creating duplicates.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import type { ReportData, ReportConfig, GateSummary, CoordinationFinding } from './types';
import { DEFAULT_REPORT_CONFIG } from './types';

/**
 * Marker text to identify Hawky comments
 * Used to find and update existing comments
 */
const HAWKY_COMMENT_MARKER = '## Hawky Review Summary';

/**
 * Status icon for gate status
 */
function statusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return ':white_check_mark:';
    case 'fail':
      return ':x:';
    case 'skip':
      return ':fast_forward:';
    case 'error':
      return ':boom:';
    default:
      return ':question:';
  }
}

/**
 * Format milliseconds as human-readable time
 */
function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds}s`;
}

/**
 * Generate the overall status badge
 */
function generateBadge(overallStatus: 'pass' | 'fail', gracePeriodActive: boolean): string {
  if (gracePeriodActive && overallStatus === 'fail') {
    return ':hourglass: **Grace Period** — Would fail after enforcement begins';
  }
  if (overallStatus === 'pass') {
    return ':white_check_mark: **All gates passed**';
  }
  return ':x: **Gates failed** — Fix blocking violations to merge';
}

/**
 * Generate the gate results table
 */
function generateGateTable(
  gates: GateSummary[],
  config: ReportConfig
): string {
  const lines: string[] = [];

  // Determine which columns to show
  const hasExisting = gates.some((g) => g.existingViolations > 0) || config.showBaselineColumn;
  const hasIgnored = gates.some((g) => g.ignoredViolations > 0) || config.showIgnoredColumn;
  const showTime = config.includeTiming;

  // Build header
  let header = '| Gate | Status | New |';
  let separator = '|------|--------|-----|';
  if (hasExisting) {
    header += ' Existing |';
    separator += '----------|';
  }
  if (hasIgnored) {
    header += ' Ignored |';
    separator += '---------|';
  }
  if (showTime) {
    header += ' Time |';
    separator += '------|';
  }

  lines.push(header);
  lines.push(separator);

  // Build rows
  for (const gate of gates) {
    const icon = statusIcon(gate.status);
    const details = formatGateDetails(gate);

    let row = `| ${gate.displayName} | ${icon} ${gate.status} | ${details} |`;

    if (hasExisting) {
      const existing = gate.existingViolations > 0 ? gate.existingViolations.toString() : '-';
      row += ` ${existing} |`;
    }

    if (hasIgnored) {
      const ignored = gate.ignoredViolations > 0 ? gate.ignoredViolations.toString() : '-';
      row += ` ${ignored} |`;
    }

    if (showTime) {
      row += ` ${formatTime(gate.timeMs)} |`;
    }

    lines.push(row);
  }

  return lines.join('\n');
}

/**
 * Format gate-specific details for the "New" column
 */
function formatGateDetails(gate: GateSummary): string {
  if (gate.status === 'skip') {
    return '-';
  }

  switch (gate.gate) {
    case 'typescript':
    case 'eslint':
      return `${gate.newViolations} error(s)`;
    case 'semgrep':
      return `${gate.newViolations} high`;
    case 'gitleaks':
      return `${gate.newViolations} secret(s)`;
    default:
      return gate.newViolations.toString();
  }
}

/**
 * Generate collapsible details section for failures
 */
function generateFailureDetails(data: ReportData): string {
  const failedGates = data.gates.filter((g) => g.status === 'fail' || g.status === 'error');

  if (failedGates.length === 0) {
    return '';
  }

  const lines: string[] = [
    '<details>',
    '<summary>:mag: Quick Links to Failed Steps</summary>',
    '',
  ];

  for (const gate of failedGates) {
    const msg =
      gate.gate === 'gitleaks'
        ? `${gate.newViolations} secret(s) detected`
        : gate.gate === 'semgrep'
          ? `${gate.newViolations} high-severity finding(s)`
          : `${gate.newViolations} error(s)`;
    lines.push(`- [${gate.displayName}](${data.workflowUrl}) — ${msg}`);
  }

  lines.push('', '</details>', '');

  return lines.join('\n');
}

/**
 * Generate skipped gates section (fail-fast)
 */
function generateFailFastSection(skippedGates: string[]): string {
  if (skippedGates.length === 0) {
    return '';
  }

  return [
    '<details>',
    '<summary>:stop_sign: Fail-Fast Skipped Gates</summary>',
    '',
    `The following gates were skipped due to a prior blocking failure: ${skippedGates.join(', ')}`,
    '',
    '_Fail-fast mode is enabled. Set `fail_fast: false` to run all gates._',
    '',
    '</details>',
    '',
  ].join('\n');
}

/**
 * Generate disabled gates section
 */
function generateDisabledSection(disabledGates: string[]): string {
  if (disabledGates.length === 0) {
    return '';
  }

  return [
    '<details>',
    '<summary>:no_entry_sign: Disabled Gates</summary>',
    '',
    `The following gates are disabled in \`.hawky.yml\`: ${disabledGates.join(', ')}`,
    '',
    '_To enable a gate, set `enabled: true` in the gate configuration._',
    '',
    '</details>',
    '',
  ].join('\n');
}

/**
 * Generate skipped gates section (no config found)
 */
function generateSkippedSection(gates: GateSummary[]): string {
  const skippedGates = gates
    .filter((g) => g.status === 'skip')
    .map((g) => g.displayName);

  if (skippedGates.length === 0) {
    return '';
  }

  return [
    '<details>',
    '<summary>:fast_forward: Skipped Gates</summary>',
    '',
    `The following gates were skipped (no configuration found): ${skippedGates.join(', ')}`,
    '',
    '</details>',
    '',
  ].join('\n');
}

/**
 * Generate coordination findings section
 *
 * S096: Coordination Integration
 */
function generateCoordinationSection(findings: CoordinationFinding[]): string {
  if (!findings || findings.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Group by tier
  const blockFindings = findings.filter((f) => f.tier === 'block');
  const warnFindings = findings.filter((f) => f.tier === 'warn');
  const informFindings = findings.filter((f) => f.tier === 'inform');

  // Header
  lines.push('### Coordination');
  lines.push('');

  // Block tier (most serious)
  if (blockFindings.length > 0) {
    lines.push(':no_entry: **Blocking Issues**');
    lines.push('');
    for (const finding of blockFindings) {
      lines.push(finding.details);
      lines.push('');
    }
  }

  // Warn tier
  if (warnFindings.length > 0) {
    lines.push(':warning: **Warnings**');
    lines.push('');
    for (const finding of warnFindings) {
      lines.push(finding.details);
      lines.push('');
    }
  }

  // Inform tier
  if (informFindings.length > 0) {
    lines.push(':information_source: **Information**');
    lines.push('');
    for (const finding of informFindings) {
      lines.push(finding.details);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate grace period section
 */
function generateGracePeriodSection(data: ReportData): string {
  if (!data.gracePeriodActive || !data.gracePeriodEndDate) {
    return '';
  }

  const failedGates = data.gates.filter((g) => g.status === 'fail');
  if (failedGates.length === 0) {
    return '';
  }

  const gateNames = failedGates.map((g) => g.displayName).join(', ');

  return [
    '<details>',
    `<summary>:hourglass: Grace Period — Would Block After ${data.gracePeriodEndDate}</summary>`,
    '',
    `The following gates failed but are not blocking during grace period: ${gateNames}`,
    '',
    `_After ${data.gracePeriodEndDate}, these violations will block merge. Fix them before then!_`,
    '',
    '</details>',
    '',
  ].join('\n');
}

/**
 * Generate the full PR comment markdown
 */
export function generatePRComment(
  data: ReportData,
  config: ReportConfig = DEFAULT_REPORT_CONFIG
): string {
  const lines: string[] = [];

  // Header with marker (used to find existing comments)
  lines.push(HAWKY_COMMENT_MARKER);
  lines.push('');

  // Overall status badge
  lines.push(generateBadge(data.overallStatus, data.gracePeriodActive));
  lines.push('');

  // Baseline info
  if (data.baselineActive) {
    lines.push(
      `:bookmark: **Baseline active** — ${data.baselineViolationCount} existing violation(s) excluded`
    );
    lines.push('');
  }

  // Grace period banner
  if (data.gracePeriodActive && data.gracePeriodEndDate) {
    lines.push(
      `:hourglass_flowing_sand: **Grace Period Active** — Hawky is in grace period, enforcement starts ${data.gracePeriodEndDate}`
    );
    lines.push('');
    lines.push(
      `_During grace period, all findings are warnings only. After ${data.gracePeriodEndDate}, violations will block merge._`
    );
    lines.push('');
  }

  // Hawkyignore info
  if (data.hawkyignoreActive) {
    lines.push(
      `:see_no_evil: **.hawkyignore** — ${data.hawkyignorePatternCount} pattern(s) active`
    );
    lines.push('');
  }

  // Gate results table
  lines.push(generateGateTable(data.gates, config));
  lines.push('');

  // Coordination findings section (S096)
  if (data.coordinationFindings && data.coordinationFindings.length > 0) {
    lines.push(generateCoordinationSection(data.coordinationFindings));
  }

  // Detail sections (collapsible)
  if (config.includeDetails) {
    // Failure details
    if (data.overallStatus === 'fail') {
      lines.push(generateFailureDetails(data));
    }

    // Fail-fast skipped gates
    lines.push(generateFailFastSection(data.failFastSkippedGates));

    // Disabled gates
    lines.push(generateDisabledSection(data.disabledGates));

    // Grace period warnings
    lines.push(generateGracePeriodSection(data));

    // Skipped gates (no config)
    lines.push(generateSkippedSection(data.gates));
  }

  // Footer
  if (config.includeWorkflowLink) {
    lines.push('---');
    lines.push(
      `_Hawky Review | [Workflow Run](${data.workflowUrl}) | Commit: \`${data.commitSha.slice(0, 7)}\`_`
    );
  }

  return lines.join('\n');
}

/**
 * Find existing Hawky comment on PR
 */
async function findExistingComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    for (const comment of comments) {
      if (comment.body?.includes(HAWKY_COMMENT_MARKER)) {
        return comment.id;
      }
    }

    return null;
  } catch (error) {
    core.warning(`Failed to list comments: ${error}`);
    return null;
  }
}

/**
 * Post or update PR comment with gate results
 */
export async function postPRComment(
  data: ReportData,
  token: string,
  config: ReportConfig = DEFAULT_REPORT_CONFIG
): Promise<{ success: boolean; commentId?: number; error?: string }> {
  // Check if we're in a PR context
  const context = github.context;
  const prNumber = data.prNumber || context.payload.pull_request?.number;

  if (!prNumber) {
    core.info('Not in a PR context — skipping PR comment');
    return { success: true };
  }

  if (!token) {
    core.warning('No GitHub token provided — skipping PR comment');
    return { success: false, error: 'No GitHub token' };
  }

  try {
    const octokit = github.getOctokit(token);
    const repoParts = data.repository.split('/');
    const owner = repoParts[0] || '';
    const repo = repoParts[1] || '';

    if (!owner || !repo) {
      return { success: false, error: `Invalid repository format: ${data.repository}` };
    }

    // Generate comment body
    const body = generatePRComment(data, config);

    // Find existing comment
    const existingCommentId = await findExistingComment(octokit, owner, repo, prNumber);

    if (existingCommentId) {
      // Update existing comment
      core.info(`Updating existing Hawky comment: ${existingCommentId}`);
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingCommentId,
        body,
      });
      return { success: true, commentId: existingCommentId };
    } else {
      // Create new comment
      core.info('Creating new Hawky comment');
      const { data: newComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      return { success: true, commentId: newComment.id };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to post PR comment: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Export marker for testing
 */
export { HAWKY_COMMENT_MARKER };
