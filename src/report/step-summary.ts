/**
 * Step Summary Reporter
 *
 * Generates GitHub Actions step summary for gate results.
 * Uses @actions/core.summary API for rich markdown formatting.
 */

import * as core from '@actions/core';
import type { ReportData, GateSummary, ReportConfig } from './types';
import { DEFAULT_REPORT_CONFIG } from './types';

/**
 * Status icon for gate status (emoji version for step summary)
 */
function statusEmoji(status: string): string {
  switch (status) {
    case 'pass':
      return '\u2705'; // green check
    case 'fail':
      return '\u274C'; // red X
    case 'skip':
      return '\u23E9'; // fast forward
    case 'error':
      return '\u{1F4A5}'; // explosion
    default:
      return '\u2753'; // question mark
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
 * Generate the overall status heading
 */
function generateStatusHeading(data: ReportData): string {
  if (data.gracePeriodActive && data.overallStatus === 'fail') {
    return '\u23F3 Hawky Review — Grace Period (Would Fail)';
  }
  if (data.overallStatus === 'pass') {
    return '\u2705 Hawky Review — All Gates Passed';
  }
  return '\u274C Hawky Review — Gates Failed';
}

/**
 * Format gate-specific details for the table
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
 * Build the gate results table rows
 */
function buildGateTableRows(
  gates: GateSummary[],
  config: ReportConfig
): { headers: string[]; rows: string[][] } {
  // Determine which columns to show
  const hasExisting = gates.some((g) => g.existingViolations > 0) || config.showBaselineColumn;
  const hasIgnored = gates.some((g) => g.ignoredViolations > 0) || config.showIgnoredColumn;
  const showTime = config.includeTiming;

  // Build headers
  const headers = ['Gate', 'Status', 'New'];
  if (hasExisting) headers.push('Existing');
  if (hasIgnored) headers.push('Ignored');
  if (showTime) headers.push('Time');

  // Build rows
  const rows: string[][] = [];
  for (const gate of gates) {
    const emoji = statusEmoji(gate.status);
    const details = formatGateDetails(gate);

    const row = [gate.displayName, `${emoji} ${gate.status}`, details];

    if (hasExisting) {
      row.push(gate.existingViolations > 0 ? gate.existingViolations.toString() : '-');
    }

    if (hasIgnored) {
      row.push(gate.ignoredViolations > 0 ? gate.ignoredViolations.toString() : '-');
    }

    if (showTime) {
      row.push(formatTime(gate.timeMs));
    }

    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Generate and write the step summary using @actions/core.summary API
 */
export async function writeStepSummary(
  data: ReportData,
  config: ReportConfig = DEFAULT_REPORT_CONFIG
): Promise<{ success: boolean; error?: string }> {
  try {
    // Clear any existing summary content
    core.summary.emptyBuffer();

    // Overall status heading
    core.summary.addHeading(generateStatusHeading(data), 2);

    // Baseline info
    if (data.baselineActive) {
      core.summary.addRaw(
        `\u{1F516} **Baseline active** \u2014 ${data.baselineViolationCount} existing violation(s) excluded\n\n`
      );
    }

    // Grace period banner
    if (data.gracePeriodActive && data.gracePeriodEndDate) {
      core.summary.addRaw(
        `\u23F3 **Grace Period Active** \u2014 Enforcement starts ${data.gracePeriodEndDate}\n\n` +
        `_During grace period, all findings are warnings only. After ${data.gracePeriodEndDate}, violations will block merge._\n\n`
      );
    }

    // Hawkyignore info
    if (data.hawkyignoreActive) {
      core.summary.addRaw(
        `\u{1F648} **.hawkyignore** \u2014 ${data.hawkyignorePatternCount} pattern(s) active\n\n`
      );
    }

    // Gate results table
    const { headers, rows } = buildGateTableRows(data.gates, config);

    // Build table data for addTable (requires SummaryTableRow format)
    const tableData: { data: string; header?: boolean }[][] = [];

    // Header row
    tableData.push(headers.map((h) => ({ data: h, header: true })));

    // Data rows
    for (const row of rows) {
      tableData.push(row.map((cell) => ({ data: cell })));
    }

    core.summary.addTable(tableData);

    // Add spacing
    core.summary.addRaw('\n');

    // Coordination findings section (S096)
    if (data.coordinationFindings && data.coordinationFindings.length > 0) {
      core.summary.addHeading('Coordination', 3);

      // Group by tier
      const blockFindings = data.coordinationFindings.filter((f) => f.tier === 'block');
      const warnFindings = data.coordinationFindings.filter((f) => f.tier === 'warn');
      const informFindings = data.coordinationFindings.filter((f) => f.tier === 'inform');

      if (blockFindings.length > 0) {
        core.summary.addRaw('\u{1F6D1} **Blocking Issues**\n\n');
        for (const finding of blockFindings) {
          core.summary.addDetails(finding.summary, finding.details);
        }
      }

      if (warnFindings.length > 0) {
        core.summary.addRaw('\u26A0\uFE0F **Warnings**\n\n');
        for (const finding of warnFindings) {
          core.summary.addDetails(finding.summary, finding.details);
        }
      }

      if (informFindings.length > 0) {
        core.summary.addRaw('\u2139\uFE0F **Information**\n\n');
        for (const finding of informFindings) {
          core.summary.addDetails(finding.summary, finding.details);
        }
      }
    }

    // Failed gates details (collapsible)
    const failedGates = data.gates.filter((g) => g.status === 'fail' || g.status === 'error');
    if (failedGates.length > 0 && config.includeDetails) {
      const failureDetails = failedGates.map((gate) => {
        const msg =
          gate.gate === 'gitleaks'
            ? `${gate.newViolations} secret(s) detected`
            : gate.gate === 'semgrep'
              ? `${gate.newViolations} high-severity finding(s)`
              : `${gate.newViolations} error(s)`;
        return `- **${gate.displayName}**: ${msg}`;
      }).join('\n');

      core.summary.addDetails('\u{1F50D} Failed Gates Details', failureDetails);
    }

    // Fail-fast skipped gates
    if (data.failFastSkippedGates.length > 0) {
      core.summary.addDetails(
        '\u{1F6D1} Fail-Fast Skipped Gates',
        `The following gates were skipped due to a prior blocking failure: ${data.failFastSkippedGates.join(', ')}\n\n` +
        `_Fail-fast mode is enabled. Set \`fail_fast: false\` to run all gates._`
      );
    }

    // Disabled gates
    if (data.disabledGates.length > 0) {
      core.summary.addDetails(
        '\u{26D4} Disabled Gates',
        `The following gates are disabled in \`.hawky.yml\`: ${data.disabledGates.join(', ')}\n\n` +
        `_To enable a gate, set \`enabled: true\` in the gate configuration._`
      );
    }

    // Grace period warnings
    if (data.gracePeriodActive && data.gracePeriodEndDate && failedGates.length > 0) {
      const gateNames = failedGates.map((g) => g.displayName).join(', ');
      core.summary.addDetails(
        `\u23F3 Grace Period \u2014 Would Block After ${data.gracePeriodEndDate}`,
        `The following gates failed but are not blocking during grace period: ${gateNames}\n\n` +
        `_After ${data.gracePeriodEndDate}, these violations will block merge. Fix them before then!_`
      );
    }

    // Skipped gates (no config)
    const skippedGates = data.gates.filter((g) => g.status === 'skip').map((g) => g.displayName);
    if (skippedGates.length > 0) {
      core.summary.addDetails(
        '\u23E9 Skipped Gates',
        `The following gates were skipped (no configuration found): ${skippedGates.join(', ')}`
      );
    }

    // Footer with timing and links
    if (config.includeWorkflowLink) {
      core.summary.addSeparator();
      core.summary.addRaw(
        `_Hawky Review | Total time: ${formatTime(data.totalTimeMs)} | ` +
        `[Workflow Run](${data.workflowUrl}) | Commit: \`${data.commitSha.slice(0, 7)}\`_\n`
      );
    }

    // Write to GITHUB_STEP_SUMMARY
    await core.summary.write();

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to write step summary: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Generate step summary markdown as a string (for testing)
 */
export function generateStepSummaryMarkdown(
  data: ReportData,
  config: ReportConfig = DEFAULT_REPORT_CONFIG
): string {
  const lines: string[] = [];

  // Overall status heading
  lines.push(`## ${generateStatusHeading(data)}`);
  lines.push('');

  // Baseline info
  if (data.baselineActive) {
    lines.push(
      `\u{1F516} **Baseline active** \u2014 ${data.baselineViolationCount} existing violation(s) excluded`
    );
    lines.push('');
  }

  // Grace period banner
  if (data.gracePeriodActive && data.gracePeriodEndDate) {
    lines.push(
      `\u23F3 **Grace Period Active** \u2014 Enforcement starts ${data.gracePeriodEndDate}`
    );
    lines.push(
      `_During grace period, all findings are warnings only. After ${data.gracePeriodEndDate}, violations will block merge._`
    );
    lines.push('');
  }

  // Hawkyignore info
  if (data.hawkyignoreActive) {
    lines.push(
      `\u{1F648} **.hawkyignore** \u2014 ${data.hawkyignorePatternCount} pattern(s) active`
    );
    lines.push('');
  }

  // Gate results table
  const { headers, rows } = buildGateTableRows(data.gates, config);

  // Build markdown table
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // Coordination findings section (S096)
  if (data.coordinationFindings && data.coordinationFindings.length > 0) {
    lines.push('### Coordination');
    lines.push('');

    // Group by tier
    const blockFindings = data.coordinationFindings.filter((f) => f.tier === 'block');
    const warnFindings = data.coordinationFindings.filter((f) => f.tier === 'warn');
    const informFindings = data.coordinationFindings.filter((f) => f.tier === 'inform');

    if (blockFindings.length > 0) {
      lines.push('\u{1F6D1} **Blocking Issues**');
      lines.push('');
      for (const finding of blockFindings) {
        lines.push('<details>');
        lines.push(`<summary>${finding.summary}</summary>`);
        lines.push('');
        lines.push(finding.details);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }

    if (warnFindings.length > 0) {
      lines.push('\u26A0\uFE0F **Warnings**');
      lines.push('');
      for (const finding of warnFindings) {
        lines.push('<details>');
        lines.push(`<summary>${finding.summary}</summary>`);
        lines.push('');
        lines.push(finding.details);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }

    if (informFindings.length > 0) {
      lines.push('\u2139\uFE0F **Information**');
      lines.push('');
      for (const finding of informFindings) {
        lines.push('<details>');
        lines.push(`<summary>${finding.summary}</summary>`);
        lines.push('');
        lines.push(finding.details);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }
  }

  // Failed gates details
  const failedGates = data.gates.filter((g) => g.status === 'fail' || g.status === 'error');
  if (failedGates.length > 0 && config.includeDetails) {
    lines.push('<details>');
    lines.push('<summary>\u{1F50D} Failed Gates Details</summary>');
    lines.push('');
    for (const gate of failedGates) {
      const msg =
        gate.gate === 'gitleaks'
          ? `${gate.newViolations} secret(s) detected`
          : gate.gate === 'semgrep'
            ? `${gate.newViolations} high-severity finding(s)`
            : `${gate.newViolations} error(s)`;
      lines.push(`- **${gate.displayName}**: ${msg}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Fail-fast skipped gates
  if (data.failFastSkippedGates.length > 0) {
    lines.push('<details>');
    lines.push('<summary>\u{1F6D1} Fail-Fast Skipped Gates</summary>');
    lines.push('');
    lines.push(
      `The following gates were skipped due to a prior blocking failure: ${data.failFastSkippedGates.join(', ')}`
    );
    lines.push('');
    lines.push(`_Fail-fast mode is enabled. Set \`fail_fast: false\` to run all gates._`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Disabled gates
  if (data.disabledGates.length > 0) {
    lines.push('<details>');
    lines.push('<summary>\u{26D4} Disabled Gates</summary>');
    lines.push('');
    lines.push(
      `The following gates are disabled in \`.hawky.yml\`: ${data.disabledGates.join(', ')}`
    );
    lines.push('');
    lines.push(`_To enable a gate, set \`enabled: true\` in the gate configuration._`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Grace period warnings
  if (data.gracePeriodActive && data.gracePeriodEndDate && failedGates.length > 0) {
    const gateNames = failedGates.map((g) => g.displayName).join(', ');
    lines.push('<details>');
    lines.push(
      `<summary>\u23F3 Grace Period \u2014 Would Block After ${data.gracePeriodEndDate}</summary>`
    );
    lines.push('');
    lines.push(
      `The following gates failed but are not blocking during grace period: ${gateNames}`
    );
    lines.push('');
    lines.push(
      `_After ${data.gracePeriodEndDate}, these violations will block merge. Fix them before then!_`
    );
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Skipped gates
  const skippedGates = data.gates.filter((g) => g.status === 'skip').map((g) => g.displayName);
  if (skippedGates.length > 0) {
    lines.push('<details>');
    lines.push('<summary>\u23E9 Skipped Gates</summary>');
    lines.push('');
    lines.push(
      `The following gates were skipped (no configuration found): ${skippedGates.join(', ')}`
    );
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  if (config.includeWorkflowLink) {
    lines.push('---');
    lines.push(
      `_Hawky Review | Total time: ${formatTime(data.totalTimeMs)} | ` +
      `[Workflow Run](${data.workflowUrl}) | Commit: \`${data.commitSha.slice(0, 7)}\`_`
    );
  }

  return lines.join('\n');
}
