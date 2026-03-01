/**
 * Visual Report Module
 *
 * Generates markdown reports for visual regression test results.
 * Creates collapsible sections per route with diff details.
 *
 * S068: Visual Change Summary
 */

import type { VisualTestResult, Viewport } from './types';

/**
 * Format viewport for display
 */
function formatViewport(viewport: Viewport): string {
  const name = viewport.name ?? `${viewport.width}x${viewport.height}`;
  return `${name} (${viewport.width}x${viewport.height})`;
}

/**
 * Get status emoji for test result
 */
function getStatusEmoji(passed: boolean, hasError: boolean): string {
  if (hasError) return ':x:';
  return passed ? ':white_check_mark:' : ':warning:';
}

/**
 * Format diff percentage for display
 */
function formatDiffPercentage(percentage: number): string {
  if (percentage === 0) {
    return '0%';
  }
  return `${percentage.toFixed(2)}%`;
}

/**
 * Generate artifact URL for diff image
 *
 * In GitHub Actions, artifacts are uploaded and can be linked.
 * Format depends on how artifacts are uploaded.
 */
function getDiffImageLink(diffImagePath: string | undefined): string {
  if (!diffImagePath) {
    return '-';
  }
  // Extract filename from path for display
  const filename = diffImagePath.split('/').pop() ?? diffImagePath;
  return `[${filename}](${diffImagePath})`;
}

/**
 * Format a single visual test result as table row
 */
function formatResultRow(result: VisualTestResult): string {
  const status = getStatusEmoji(result.passed, !!result.error);
  const viewport = formatViewport(result.viewport);
  const diffPct = formatDiffPercentage(result.diffPercentage);
  const diffLink = getDiffImageLink(result.diffImagePath);

  return `| ${status} | \`${result.route}\` | ${viewport} | ${diffPct} | ${diffLink} |`;
}

/**
 * Group results by route for collapsible sections
 */
function groupByRoute(results: VisualTestResult[]): Map<string, VisualTestResult[]> {
  const grouped = new Map<string, VisualTestResult[]>();

  for (const result of results) {
    const existing = grouped.get(result.route);
    if (existing) {
      existing.push(result);
    } else {
      grouped.set(result.route, [result]);
    }
  }

  return grouped;
}

/**
 * Format a collapsible section for a single route
 */
function formatRouteSection(route: string, results: VisualTestResult[]): string {
  const allPassed = results.every((r) => r.passed && !r.error);
  const hasErrors = results.some((r) => !!r.error);
  const statusIcon = hasErrors ? ':x:' : allPassed ? ':white_check_mark:' : ':warning:';

  const lines: string[] = [];

  lines.push(`<details>`);
  lines.push(`<summary>${statusIcon} <code>${route}</code></summary>`);
  lines.push('');

  // Add table header
  lines.push('| Status | Route | Viewport | Diff | Diff Image |');
  lines.push('|--------|-------|----------|------|------------|');

  // Add rows
  for (const result of results) {
    lines.push(formatResultRow(result));
  }

  // Add error details if any
  const errors = results.filter((r) => !!r.error);
  if (errors.length > 0) {
    lines.push('');
    lines.push('**Errors:**');
    for (const result of errors) {
      lines.push(`- ${formatViewport(result.viewport)}: ${result.error}`);
    }
  }

  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Generate summary statistics
 */
function generateSummary(results: VisualTestResult[]): {
  total: number;
  passed: number;
  failed: number;
  errors: number;
} {
  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (const result of results) {
    if (result.error) {
      errors++;
    } else if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  return {
    total: results.length,
    passed,
    failed,
    errors,
  };
}

/**
 * Format visual regression report
 *
 * Generates a markdown report with:
 * - Summary statistics
 * - Collapsible sections per route
 * - Diff percentages and image links
 *
 * @param results - Array of visual test results
 * @returns Formatted markdown report
 */
export function formatVisualReport(results: VisualTestResult[]): string {
  const lines: string[] = [];

  // Header
  lines.push('## Visual Regression Results');
  lines.push('');

  // Summary
  const summary = generateSummary(results);
  const overallStatus =
    summary.errors > 0 ? ':x:' : summary.failed > 0 ? ':warning:' : ':white_check_mark:';

  lines.push(`${overallStatus} **${summary.total} tests** | `);
  lines.push(`:white_check_mark: ${summary.passed} passed | `);
  lines.push(`:warning: ${summary.failed} regressions | `);
  lines.push(`:x: ${summary.errors} errors`);
  lines.push('');

  if (results.length === 0) {
    lines.push('*No visual tests were run.*');
    return lines.join('\n');
  }

  // Group by route and create collapsible sections
  const groupedResults = groupByRoute(results);

  for (const [route, routeResults] of groupedResults) {
    lines.push(formatRouteSection(route, routeResults));
    lines.push('');
  }

  // Footer with instructions
  lines.push('---');
  lines.push('');
  lines.push(
    '*Visual regression tests compare screenshots of the PR branch against the base branch. ' +
      'Differences above the threshold (default 0.1%) are flagged as potential regressions.*'
  );

  return lines.join('\n');
}

/**
 * Format a compact summary line for PR comment
 *
 * @param results - Array of visual test results
 * @returns Single-line summary
 */
export function formatVisualSummary(results: VisualTestResult[]): string {
  const summary = generateSummary(results);

  if (summary.total === 0) {
    return 'No visual regression tests configured';
  }

  if (summary.errors > 0) {
    return `Visual: ${summary.errors} errors, ${summary.failed} regressions, ${summary.passed} passed`;
  }

  if (summary.failed > 0) {
    return `Visual: ${summary.failed} regressions detected (${summary.passed} passed)`;
  }

  return `Visual: ${summary.passed} tests passed`;
}

/**
 * Check if any visual tests failed
 *
 * @param results - Array of visual test results
 * @returns Whether any tests failed or errored
 */
export function hasVisualRegressions(results: VisualTestResult[]): boolean {
  return results.some((r) => !r.passed || !!r.error);
}
