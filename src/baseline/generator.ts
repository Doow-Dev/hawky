/**
 * Baseline Generator
 *
 * Scans the FULL repository for violations and generates a baseline file.
 * This is used during initial onboarding to capture existing technical debt.
 *
 * Triggered via workflow_dispatch with mode: baseline
 *
 * Outputs:
 * - .hawky/baseline.json: Violations database with stable hashes
 * - .hawky/onboarding-report.md: Human-readable summary for team review
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type { Baseline, BaselineViolation } from './types';
import { computeHash } from './hash';
import type { GateName, HawkyConfig } from '../config/types';
import type { GateResult, Violation } from '../gates/types';
import {
  typescriptGate,
  eslintGate,
  semgrepGate,
  gitleaksGate,
} from '../gates';

/**
 * Options for baseline generation
 */
export interface GeneratorOptions {
  /** Working directory (repo root) */
  cwd: string;

  /** Branch name for baseline metadata */
  branch: string;

  /** Commit SHA for baseline metadata */
  commit: string;

  /** Hawky configuration */
  config: HawkyConfig;

  /** Whether to commit and push baseline files */
  commitAndPush?: boolean;

  /** GitHub token for pushing (required if commitAndPush is true) */
  githubToken?: string;
}

/**
 * Result of baseline generation
 */
export interface GeneratorResult {
  /** Whether generation succeeded */
  success: boolean;

  /** The generated baseline */
  baseline: Baseline | null;

  /** Path to baseline.json */
  baselinePath: string | null;

  /** Path to onboarding-report.md */
  reportPath: string | null;

  /** Error message if failed */
  error?: string;

  /** Summary of violations by gate */
  summary: {
    total: number;
    typescript: number;
    eslint: number;
    semgrep: number;
    gitleaks: number;
  };

  /** Gate results for reporting */
  gateResults: GateResult[];
}

/**
 * Convert a Violation to a BaselineViolation
 */
function violationToBaselineEntry(
  violation: Violation,
  cwd: string
): BaselineViolation {
  const fullPath = path.join(cwd, violation.file);
  const hash = computeHash(violation.ruleId, fullPath, violation.line);

  return {
    rule: violation.ruleId,
    file: violation.file,
    line_hint: violation.line,
    hash,
    gate: violation.gate as BaselineViolation['gate'],
    message: violation.message.substring(0, 200), // Truncate long messages
    first_seen: new Date().toISOString(),
  };
}

/**
 * Run a single gate in scan mode (full repo)
 */
async function runGateScan(
  gateName: GateName,
  config: HawkyConfig,
  cwd: string
): Promise<GateResult> {
  const gateConfig = config.gates[gateName];
  const timeoutMs = gateConfig.timeout * 1000;

  const options = {
    cwd,
    timeoutMs,
    createAnnotations: false, // No annotations in baseline mode
  };

  switch (gateName) {
    case 'typescript':
      return typescriptGate.run(options);
    case 'eslint':
      return eslintGate.run(options);
    case 'semgrep':
      // Set rulesets from config via environment variable
      const rulesets = gateConfig.rulesets || 'p/security-audit';
      process.env['HAWKY_GATE_SEMGREP_RULESETS'] = rulesets;
      return semgrepGate.run(options);
    case 'gitleaks':
      return gitleaksGate.run(options);
    default:
      // Unsupported gates (build, test) return empty results
      return {
        gate: gateName,
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: 0,
        message: `${gateName} gate not supported for baseline generation`,
      };
  }
}

/**
 * Generate markdown onboarding report
 */
function generateOnboardingReport(
  baseline: Baseline,
  gateResults: GateResult[]
): string {
  const lines: string[] = [];

  lines.push('# Hawky Onboarding Report');
  lines.push('');
  lines.push(`Generated: ${baseline.generated_at}`);
  lines.push(`Branch: ${baseline.branch}`);
  lines.push(`Commit: ${baseline.commit}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`Total violations baselined: **${baseline.violations.length}**`);
  lines.push('');

  if (baseline.summary) {
    lines.push('| Gate | Violations |');
    lines.push('|------|------------|');
    lines.push(`| TypeScript | ${baseline.summary.typescript} |`);
    lines.push(`| ESLint | ${baseline.summary.eslint} |`);
    lines.push(`| Semgrep | ${baseline.summary.semgrep} |`);
    lines.push(`| Gitleaks | ${baseline.summary.gitleaks} |`);
    lines.push('');
  }

  // Gate details
  lines.push('## Gate Results');
  lines.push('');

  for (const result of gateResults) {
    if (result.status === 'skip') continue;

    lines.push(`### ${result.gate.charAt(0).toUpperCase() + result.gate.slice(1)}`);
    lines.push('');
    lines.push(`- **Status**: ${result.status}`);
    lines.push(`- **Violations**: ${result.totalViolations}`);
    lines.push(`- **Time**: ${result.timeMs}ms`);
    lines.push('');

    // Top violations by file
    if (result.violations.length > 0) {
      const byFile = new Map<string, number>();
      for (const v of result.violations) {
        byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
      }

      const topFiles = Array.from(byFile.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      lines.push('<details>');
      lines.push(`<summary>Top files with violations (${topFiles.length} shown)</summary>`);
      lines.push('');
      lines.push('| File | Count |');
      lines.push('|------|-------|');
      for (const [file, count] of topFiles) {
        lines.push(`| \`${file}\` | ${count} |`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Security notice for gitleaks
  const gitleaksResult = gateResults.find(r => r.gate === 'gitleaks');
  if (gitleaksResult && gitleaksResult.violations.length > 0) {
    lines.push('## Security Notice');
    lines.push('');
    lines.push('> **WARNING**: The baseline includes potential secrets detected by Gitleaks.');
    lines.push('> These should be rotated immediately, even if they are false positives.');
    lines.push('> Secrets in baseline are NOT an excuse to ignore them.');
    lines.push('');
  }

  // Next steps
  lines.push('## Next Steps');
  lines.push('');
  lines.push('1. Review this report with your team');
  lines.push('2. Set a grace period in `.hawky.yml` if needed:');
  lines.push('   ```yaml');
  lines.push('   grace_period:');
  lines.push('     end_date: "2026-03-31"  # Or number of sprints');
  lines.push('   ```');
  lines.push('3. Commit the baseline: `git add .hawky/ && git commit -m "chore: add hawky baseline"`');
  lines.push('4. New PRs will only fail on NEW violations');
  lines.push('5. Gradually fix baselined violations as you touch those files');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Generated by [Hawky](https://github.com/the-crux-squad/hawky)*');

  return lines.join('\n');
}

/**
 * Generate baseline by scanning the full repository
 */
export async function generateBaseline(
  options: GeneratorOptions
): Promise<GeneratorResult> {
  const { cwd, branch, commit, config } = options;

  core.info('Starting baseline generation...');
  core.info(`  Branch: ${branch}`);
  core.info(`  Commit: ${commit}`);

  // Initialize result
  const result: GeneratorResult = {
    success: false,
    baseline: null,
    baselinePath: null,
    reportPath: null,
    summary: {
      total: 0,
      typescript: 0,
      eslint: 0,
      semgrep: 0,
      gitleaks: 0,
    },
    gateResults: [],
  };

  try {
    // Create .hawky directory if it doesn't exist
    const hawkyDir = path.join(cwd, '.hawky');
    if (!fs.existsSync(hawkyDir)) {
      fs.mkdirSync(hawkyDir, { recursive: true });
      core.info(`Created directory: ${hawkyDir}`);
    }

    // Run all enabled gates
    const gatesToRun: GateName[] = ['typescript', 'eslint', 'semgrep', 'gitleaks'];
    const allViolations: BaselineViolation[] = [];

    for (const gateName of gatesToRun) {
      const gateConfig = config.gates[gateName];

      // Skip disabled gates
      if (!gateConfig.enabled) {
        core.info(`Skipping ${gateName} (disabled in config)`);
        continue;
      }

      core.startGroup(`Scanning with ${gateName}`);

      const gateResult = await runGateScan(gateName, config, cwd);
      result.gateResults.push(gateResult);

      core.info(`  Status: ${gateResult.status}`);
      core.info(`  Violations: ${gateResult.totalViolations}`);
      core.info(`  Time: ${gateResult.timeMs}ms`);

      // Convert violations to baseline entries
      for (const violation of gateResult.violations) {
        const entry = violationToBaselineEntry(violation, cwd);
        allViolations.push(entry);

        // Update counts
        result.summary[violation.gate as keyof typeof result.summary]++;
      }

      core.endGroup();
    }

    result.summary.total = allViolations.length;

    // Create baseline object
    const baseline: Baseline = {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      branch,
      commit,
      violations: allViolations,
      summary: {
        total: result.summary.total,
        typescript: result.summary.typescript,
        eslint: result.summary.eslint,
        semgrep: result.summary.semgrep,
        gitleaks: result.summary.gitleaks,
      },
    };

    // Write baseline.json
    const baselinePath = path.join(hawkyDir, 'baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
    core.info(`Wrote baseline: ${baselinePath}`);

    // Generate and write onboarding report
    const reportPath = path.join(hawkyDir, 'onboarding-report.md');
    const report = generateOnboardingReport(baseline, result.gateResults);
    fs.writeFileSync(reportPath, report, 'utf8');
    core.info(`Wrote report: ${reportPath}`);

    // Commit and push if requested
    if (options.commitAndPush) {
      core.startGroup('Committing baseline files');

      try {
        // Configure git
        await exec.exec('git', ['config', 'user.name', 'Hawky Bot'], { cwd });
        await exec.exec('git', ['config', 'user.email', 'hawky@the-crux-squad.com'], { cwd });

        // Add files
        await exec.exec('git', ['add', '.hawky/baseline.json', '.hawky/onboarding-report.md'], { cwd });

        // Commit
        await exec.exec('git', ['commit', '-m', 'chore: add hawky baseline\n\nGenerated by Hawky baseline mode'], { cwd });

        // Push (requires token)
        if (options.githubToken) {
          await exec.exec('git', ['push'], {
            cwd,
            env: {
              ...process.env,
              GIT_ASKPASS: 'echo',
              GIT_TERMINAL_PROMPT: '0',
            },
          });
          core.info('Pushed baseline files to remote');
        } else {
          core.warning('No GitHub token provided, skipping push');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        core.warning(`Failed to commit/push: ${errorMessage}`);
      }

      core.endGroup();
    }

    // Update result
    result.success = true;
    result.baseline = baseline;
    result.baselinePath = baselinePath;
    result.reportPath = reportPath;

    core.info('');
    core.info('Baseline generation complete!');
    core.info(`  Total violations: ${result.summary.total}`);
    core.info(`  TypeScript: ${result.summary.typescript}`);
    core.info(`  ESLint: ${result.summary.eslint}`);
    core.info(`  Semgrep: ${result.summary.semgrep}`);
    core.info(`  Gitleaks: ${result.summary.gitleaks}`);

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    core.error(`Baseline generation failed: ${errorMessage}`);
    result.error = errorMessage;
    return result;
  }
}

/**
 * Generate baseline with auto-detected branch and commit
 */
export async function generateBaselineFromCwd(
  config: HawkyConfig,
  commitAndPush?: boolean,
  githubToken?: string
): Promise<GeneratorResult> {
  const cwd = process.cwd();

  // Get current branch
  let branch = process.env['GITHUB_REF_NAME'] || '';
  if (!branch) {
    try {
      let output = '';
      await exec.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
        },
      });
      branch = output.trim() || 'unknown';
    } catch {
      branch = 'unknown';
    }
  }

  // Get current commit
  let commit = process.env['GITHUB_SHA'] || '';
  if (!commit) {
    try {
      let output = '';
      await exec.exec('git', ['rev-parse', 'HEAD'], {
        cwd,
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
        },
      });
      commit = output.trim() || 'unknown';
    } catch {
      commit = 'unknown';
    }
  }

  const opts: GeneratorOptions = {
    cwd,
    branch,
    commit,
    config,
  };

  // Only set optional properties if defined (for exactOptionalPropertyTypes)
  if (commitAndPush !== undefined) {
    opts.commitAndPush = commitAndPush;
  }
  if (githubToken !== undefined) {
    opts.githubToken = githubToken;
  }

  return generateBaseline(opts);
}
