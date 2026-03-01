/**
 * Hawky - AI-Powered Code Quality Gates
 *
 * Main entry point for the GitHub Action.
 * Reads inputs, orchestrates gates, and reports results.
 */

import * as core from '@actions/core';
import { loadConfigFromCwd, GATE_NAMES, type HawkyConfig, type GateName } from './config';
import {
  loadBaselineFromCwd,
  getViolationCounts,
  isExistingViolation,
  generateBaselineFromCwd,
  type Baseline,
  type BaselineLoadResult,
} from './baseline';
import {
  loadIgnoreFromCwd,
  getPatternSummary,
  shouldIgnore,
  type IgnorePattern,
  type IgnoreLoadResult,
} from './ignore';
import * as github from '@actions/github';
import {
  typescriptGate,
  eslintGate,
  semgrepGate,
  gitleaksGate,
  designSystemGate,
  violationToAnnotation,
  type GateResult,
  type Violation,
  type Annotation,
} from './gates';
import {
  postPRComment,
  writeStepSummary,
  gateResultToSummary,
  GATE_DISPLAY_NAMES,
  type ReportData,
  type GateSummary,
  type SuppressionEntry,
} from './report';

/**
 * Operating mode for Hawky
 */
type HawkyMode = 'check' | 'baseline';

/**
 * Parsed action inputs
 */
interface HawkyInputs {
  mode: HawkyMode;
  failFast: boolean;
  gates: string[];
  configPath: string;
  githubToken: string;
  commitBaseline: boolean;
}

/**
 * Read and parse action inputs from workflow
 */
function getInputs(): HawkyInputs {
  const modeRaw = core.getInput('mode', { required: false }) || 'check';
  const failFastRaw = core.getInput('fail_fast', { required: false });
  const gatesRaw = core.getInput('gates', { required: false });
  const configPath = core.getInput('config_path', { required: false });
  const githubToken = core.getInput('github_token', { required: false });
  const commitBaselineRaw = core.getInput('commit_baseline', { required: false });

  // Parse mode (default: check)
  const mode: HawkyMode = modeRaw.toLowerCase() === 'baseline' ? 'baseline' : 'check';

  // Parse fail_fast as boolean (default: true)
  const failFast = failFastRaw.toLowerCase() !== 'false';

  // Parse commit_baseline as boolean (default: false)
  const commitBaseline = commitBaselineRaw.toLowerCase() === 'true';

  // Parse gates as comma-separated list
  const gates = gatesRaw
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 0);

  return {
    mode,
    failFast,
    gates,
    configPath: configPath || '.hawky.yml',
    githubToken,
    commitBaseline,
  };
}

/**
 * Result of filtering violations through baseline and hawkyignore
 */
interface FilterResult {
  /** Updated gate result with correct counts */
  gateResult: GateResult;
  /** Detailed suppression entries for the dashboard */
  suppressions: SuppressionEntry[];
}

/**
 * Filter violations through baseline and hawkyignore
 * Returns updated GateResult with correct counts and filtered annotations,
 * plus detailed suppression entries for the dashboard.
 */
function filterViolations(
  result: GateResult,
  baseline: Baseline | null,
  ignorePatterns: IgnorePattern[],
  cwd: string
): FilterResult {
  const newViolations: Violation[] = [];
  const existingViolations: Violation[] = [];
  const ignoredViolations: Violation[] = [];
  const newAnnotations: Annotation[] = [];
  const suppressions: SuppressionEntry[] = [];

  for (const violation of result.violations) {
    // Check hawkyignore first
    const gatePrefix = `${violation.gate}:${violation.ruleId}`;
    const ignoreResult = shouldIgnore(violation.file, gatePrefix, ignorePatterns);

    if (ignoreResult.ignored) {
      ignoredViolations.push(violation);

      // Track suppression details for dashboard
      // The "reason" from ignoreResult is the raw pattern line from .hawkyignore
      // A proper reason would include a comment after the pattern
      const reason = ignoreResult.reason || null;
      suppressions.push({
        file: violation.file,
        line: violation.line,
        rule: gatePrefix,
        gate: violation.gate,
        reason,
        // A suppression "has a reason" if there's explanatory text
        // For now, we consider all suppressions without comments as lacking reason
        // The pattern itself is not a justification
        hasReason: false, // Will be improved when .hawkyignore supports inline comments
      });

      continue;
    }

    // Check baseline
    if (baseline) {
      // Compute hash using file path and line number (hash.ts reads the file)
      const fullPath = `${cwd}/${violation.file}`;
      const matchResult = isExistingViolation(
        violation.ruleId,
        fullPath,
        violation.line,
        baseline
      );

      if (!matchResult.isNew) {
        existingViolations.push(violation);
        continue;
      }
    }

    // It's a new violation
    newViolations.push(violation);
    newAnnotations.push(violationToAnnotation(violation));
  }

  // Determine status based on new ERROR violations only
  // Warnings (severity === 'warning') should not block
  // If severity is undefined (legacy violations), treat as blocking error
  const hasNewErrors = newViolations.some(
    (v) => v.severity === 'error' || v.severity === undefined
  );
  const status = hasNewErrors ? 'fail' : 'pass';
  const message =
    newViolations.length > 0
      ? `${newViolations.length} new error(s) found (${existingViolations.length} existing, ${ignoredViolations.length} ignored)`
      : existingViolations.length > 0
        ? `No new errors (${existingViolations.length} existing in baseline)`
        : result.message;

  return {
    gateResult: {
      ...result,
      status,
      newViolations: newViolations.length,
      existingViolations: existingViolations.length,
      ignoredViolations: ignoredViolations.length,
      annotations: newAnnotations,
      message,
    },
    suppressions,
  };
}

/**
 * Log gate result to console
 */
function logGateResult(result: GateResult): void {
  const icon =
    result.status === 'pass'
      ? '[PASS]'
      : result.status === 'skip'
        ? '[SKIP]'
        : result.status === 'error'
          ? '[ERROR]'
          : '[FAIL]';

  core.info(`${icon} ${result.gate}: ${result.message} (${result.timeMs}ms)`);

  if (result.totalViolations > 0) {
    core.info(`  - Total: ${result.totalViolations}`);
    core.info(`  - New: ${result.newViolations}`);
    core.info(`  - Existing (baseline): ${result.existingViolations}`);
    core.info(`  - Ignored: ${result.ignoredViolations}`);
  }
}

/**
 * Run baseline generation mode
 */
async function runBaselineMode(inputs: HawkyInputs): Promise<void> {
  core.info('Hawky starting in BASELINE mode...');
  core.info('This will scan the full repository and generate a baseline.');

  // Load config
  core.startGroup('Loading Configuration');
  const configResult = loadConfigFromCwd(inputs.configPath);
  const config: HawkyConfig = configResult.config;

  if (configResult.configFound) {
    core.info(`Loaded config from: ${configResult.configPath}`);
  } else {
    core.info('No .hawky.yml found — using defaults');
  }

  // Log any config warnings
  for (const warning of configResult.warnings) {
    core.warning(`Config warning [${warning.field}]: ${warning.message}`);
  }
  core.endGroup();

  // Generate baseline
  core.info('');
  core.info('Scanning repository for violations...');

  const result = await generateBaselineFromCwd(
    config,
    inputs.commitBaseline,
    inputs.githubToken
  );

  if (result.success) {
    core.info('');
    core.info('='.repeat(50));
    core.info('Baseline Generation Complete');
    core.info('='.repeat(50));
    core.info(`Total violations baselined: ${result.summary.total}`);
    core.info(`  - TypeScript: ${result.summary.typescript}`);
    core.info(`  - ESLint: ${result.summary.eslint}`);
    core.info(`  - Semgrep: ${result.summary.semgrep}`);
    core.info(`  - Gitleaks: ${result.summary.gitleaks}`);
    core.info('');
    core.info(`Files generated:`);
    core.info(`  - ${result.baselinePath}`);
    core.info(`  - ${result.reportPath}`);

    // Set outputs
    core.setOutput('status', 'pass');
    core.setOutput('baseline_violations', result.summary.total);
    core.setOutput('baseline_path', result.baselinePath);
  } else {
    core.setFailed(`Baseline generation failed: ${result.error}`);
  }
}

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    core.info('Hawky starting...');

    // Read inputs
    const inputs = getInputs();

    core.info(`Configuration:`);
    core.info(`  - Mode: ${inputs.mode}`);
    core.info(`  - Fail fast: ${inputs.failFast}`);
    core.info(`  - Gates: ${inputs.gates.join(', ')}`);
    core.info(`  - Config path: ${inputs.configPath}`);

    // S106: Check for baseline mode and branch early
    if (inputs.mode === 'baseline') {
      await runBaselineMode(inputs);
      return;
    }

    // Normal check mode continues below...
    // S097: Load and parse config from configPath
    core.startGroup('Loading Configuration');
    const configResult = loadConfigFromCwd(inputs.configPath);
    const config: HawkyConfig = configResult.config;

    if (configResult.configFound) {
      core.info(`Loaded config from: ${configResult.configPath}`);
    } else {
      core.info('No .hawky.yml found — using defaults');
    }

    // Log any config warnings
    for (const warning of configResult.warnings) {
      core.warning(`Config warning [${warning.field}]: ${warning.message}`);
    }

    // Merge action inputs with config (action inputs take precedence)
    // fail_fast from action input overrides config
    const effectiveFailFast = inputs.failFast !== undefined ? inputs.failFast : config.failFast;

    core.info(`Effective configuration:`);
    core.info(`  - Fail fast: ${effectiveFailFast}`);
    core.info(`  - Config file: ${configResult.configPath || 'defaults'}`);

    // Log grace period status
    if (config.gracePeriod.active) {
      core.info(`  - Grace period: ACTIVE (ends ${config.gracePeriod.endDate})`);
    }
    core.endGroup();

    // Determine which gates to run (from action input or all enabled in config)
    let gatesToRun: GateName[];
    if (inputs.gates.length > 0) {
      // Filter to only valid gate names
      gatesToRun = inputs.gates.filter((g): g is GateName =>
        GATE_NAMES.includes(g as GateName)
      );
    } else {
      // Run all enabled gates
      gatesToRun = GATE_NAMES.filter((g) => config.gates[g].enabled);
    }

    // Log gate configuration
    core.startGroup('Gate Configuration');
    core.info(`Running ${gatesToRun.length} gates:`);
    for (const gate of gatesToRun) {
      const gateConfig = config.gates[gate];
      const status = gateConfig.enabled ? 'enabled' : 'disabled';
      const blocking = gateConfig.blocking ? 'blocking' : 'non-blocking';
      core.info(`  - ${gate}: ${status}, ${blocking}, timeout=${gateConfig.timeout}s`);
    }
    core.endGroup();

    // S098: Load baseline for violation comparison
    core.startGroup('Loading Baseline');
    const baselineResult: BaselineLoadResult = loadBaselineFromCwd();
    let baseline: Baseline | null = null;

    if (!baselineResult.found) {
      core.info('No baseline found — all violations will be treated as new');
    } else if (baselineResult.error) {
      core.warning(`Failed to load baseline: ${baselineResult.error}`);
      core.info('Proceeding without baseline — all violations will be treated as new');
    } else if (baselineResult.baseline) {
      baseline = baselineResult.baseline;
      const counts = getViolationCounts(baseline);
      core.info(`Baseline loaded: ${baselineResult.path}`);
      core.info(`  - Total violations: ${counts.total}`);
      core.info(`  - TypeScript: ${counts.typescript}`);
      core.info(`  - ESLint: ${counts.eslint}`);
      core.info(`  - Semgrep: ${counts.semgrep}`);
      core.info(`  - Gitleaks: ${counts.gitleaks}`);
      core.info(`  - Generated: ${baseline.generated_at}`);
      core.info(`  - Branch: ${baseline.branch}`);
    }
    core.endGroup();

    // S099: Load hawkyignore patterns for violation suppression
    core.startGroup('Loading Hawkyignore');
    const ignoreResult: IgnoreLoadResult = loadIgnoreFromCwd();
    let ignorePatterns: IgnorePattern[] = [];

    if (!ignoreResult.found) {
      core.info('No .hawkyignore found — all violations will be reported');
    } else {
      ignorePatterns = ignoreResult.patterns;
      const summary = getPatternSummary(ignorePatterns);
      core.info(`Loaded ${summary.total} pattern(s) from: ${ignoreResult.path}`);
      if (summary.filePatterns > 0) {
        core.info(`  - File patterns: ${summary.filePatterns}`);
      }
      if (summary.rulePatterns > 0) {
        core.info(`  - Rule patterns: ${summary.rulePatterns}`);
      }
      if (summary.combinedPatterns > 0) {
        core.info(`  - Combined patterns: ${summary.combinedPatterns}`);
      }

      // Log any parse warnings
      for (const warning of ignoreResult.warnings) {
        core.warning(`Hawkyignore warning [line ${warning.line}]: ${warning.message}`);
      }
    }
    core.endGroup();

    // S100-S103: Run individual gates
    const gateResults: GateResult[] = [];
    const allSuppressions: SuppressionEntry[] = [];
    let gatesPassed = 0;
    let gatesFailed = 0;
    let hasBlockingFailure = false;
    const cwd = process.cwd();

    for (const gateName of gatesToRun) {
      // Check fail-fast: stop if we already have a blocking failure
      if (effectiveFailFast && hasBlockingFailure) {
        core.info(`Skipping ${gateName} (fail-fast mode, previous gate failed)`);
        continue;
      }

      const gateConfig = config.gates[gateName];
      const timeoutMs = gateConfig.timeout * 1000;

      core.startGroup(`Running ${gateName} gate`);

      let result: GateResult;

      // S100: TypeScript Gate
      if (gateName === 'typescript') {
        result = await typescriptGate.run({
          cwd,
          timeoutMs,
          createAnnotations: true,
        });

        // Apply baseline and hawkyignore filtering
        if (result.violations.length > 0) {
          const filterResult = filterViolations(result, baseline, ignorePatterns, cwd);
          result = filterResult.gateResult;
          allSuppressions.push(...filterResult.suppressions);
        }
      } else if (gateName === 'eslint') {
        // S101: ESLint Gate
        result = await eslintGate.run({
          cwd,
          timeoutMs,
          createAnnotations: true,
        });

        // Apply baseline and hawkyignore filtering
        if (result.violations.length > 0) {
          const filterResult = filterViolations(result, baseline, ignorePatterns, cwd);
          result = filterResult.gateResult;
          allSuppressions.push(...filterResult.suppressions);
        }
      } else if (gateName === 'semgrep') {
        // S102: Semgrep Gate
        // Set rulesets from config via environment variable
        const rulesets = gateConfig.rulesets || 'p/security-audit';
        process.env['HAWKY_GATE_SEMGREP_RULESETS'] = rulesets;

        result = await semgrepGate.run({
          cwd,
          timeoutMs,
          createAnnotations: true,
        });

        // Apply baseline and hawkyignore filtering
        if (result.violations.length > 0) {
          const filterResult = filterViolations(result, baseline, ignorePatterns, cwd);
          result = filterResult.gateResult;
          allSuppressions.push(...filterResult.suppressions);
        }
      } else if (gateName === 'gitleaks') {
        // S103: Gitleaks Gate
        result = await gitleaksGate.run({
          cwd,
          timeoutMs,
          createAnnotations: true,
        });

        // Apply hawkyignore filtering (for test fixtures)
        // IMPORTANT: Unlike other gates, we should log a WARNING if secrets are in baseline
        // Secrets should never be "grandfathered" — they need to be removed or rotated
        if (result.violations.length > 0) {
          const filterResult = filterViolations(result, baseline, ignorePatterns, cwd);
          result = filterResult.gateResult;
          allSuppressions.push(...filterResult.suppressions);

          // If any secrets were filtered by baseline, log a security warning
          if (result.existingViolations > 0) {
            core.warning(
              `SECURITY CONCERN: ${result.existingViolations} secret(s) are in baseline. ` +
              `Secrets should NEVER be grandfathered — they must be rotated immediately.`
            );
          }
        }
      } else if (gateName === 'design-system') {
        // S026-S029: Design System Gate
        // Set configuration via environment variables
        process.env['HAWKY_GATE_DESIGN_SYSTEM_BANNED_CLASSES'] = JSON.stringify(gateConfig.bannedClasses || []);
        process.env['HAWKY_GATE_DESIGN_SYSTEM_SPACING_SCALE'] = JSON.stringify(gateConfig.spacingScale || []);
        process.env['HAWKY_GATE_DESIGN_SYSTEM_FONT_SIZE_SCALE'] = JSON.stringify(gateConfig.fontSizeScale || []);
        process.env['HAWKY_GATE_DESIGN_SYSTEM_ALLOW_HARDCODED_COLORS'] = String(gateConfig.allowHardcodedColors || false);

        result = await designSystemGate.run({
          cwd,
          timeoutMs,
          createAnnotations: true,
        });

        // Apply baseline and hawkyignore filtering
        if (result.violations.length > 0) {
          result = filterViolations(result, baseline, ignorePatterns, cwd);
        }
      } else {
        // Unsupported gate (build, test not yet implemented)
        result = {
          gate: gateName,
          status: 'skip',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: 0,
          message: `${gateName} gate not yet implemented`,
        };
      }

      gateResults.push(result);

      // Log result
      logGateResult(result);

      // Create GitHub annotations for new violations
      if (result.annotations.length > 0) {
        for (const annotation of result.annotations) {
          // Build annotation properties, only adding column if defined
          const props: { file: string; startLine: number; startColumn?: number; title: string } = {
            file: annotation.file,
            startLine: annotation.line,
            title: annotation.title || annotation.ruleId,
          };
          if (annotation.column !== undefined) {
            props.startColumn = annotation.column;
          }

          if (annotation.severity === 'error') {
            core.error(annotation.message, props);
          } else if (annotation.severity === 'warning') {
            core.warning(annotation.message, props);
          }
        }
      }

      // Track pass/fail
      if (result.status === 'pass' || result.status === 'skip') {
        gatesPassed++;
      } else if (result.status === 'fail' || result.status === 'error') {
        gatesFailed++;
        if (gateConfig.blocking) {
          hasBlockingFailure = true;
        }
      }

      core.endGroup();
    }

    // Set outputs
    const overallStatus = hasBlockingFailure ? 'fail' : 'pass';

    // S104: Generate and post PR comment
    core.startGroup('Generating PR Comment');

    // Build gate summaries for report
    const gateSummaries: GateSummary[] = gateResults.map((result) => {
      const gateConfig = config.gates[result.gate];
      return gateResultToSummary(
        result,
        GATE_DISPLAY_NAMES[result.gate],
        gateConfig.blocking
      );
    });

    // Calculate total time
    const totalTimeMs = gateResults.reduce((sum, r) => sum + r.timeMs, 0);

    // Get baseline violation count
    const baselineViolationCount = baseline ? getViolationCounts(baseline).total : 0;

    // Get hawkyignore pattern count
    const hawkyignorePatternCount = ignorePatterns.length;

    // Determine fail-fast skipped gates
    const failFastSkippedGates: GateName[] = [];
    if (effectiveFailFast && hasBlockingFailure) {
      for (const gateName of gatesToRun) {
        if (!gateResults.some((r) => r.gate === gateName)) {
          failFastSkippedGates.push(gateName);
        }
      }
    }

    // Determine disabled gates
    const disabledGates: GateName[] = GATE_NAMES.filter(
      (g) => !config.gates[g].enabled
    );

    // Build report data
    const context = github.context;
    const reportData: ReportData = {
      overallStatus,
      gates: gateSummaries,
      gatesPassed,
      gatesFailed,
      gatesSkipped: gateResults.filter((r) => r.status === 'skip').length,
      totalTimeMs,
      baselineActive: baseline !== null,
      baselineViolationCount,
      gracePeriodActive: config.gracePeriod.active,
      gracePeriodEndDate: config.gracePeriod.endDate ?? undefined,
      hawkyignoreActive: ignorePatterns.length > 0,
      hawkyignorePatternCount,
      suppressions: allSuppressions,
      failFastSkippedGates,
      disabledGates,
      commitSha: context.sha || process.env['GITHUB_SHA'] || 'unknown',
      workflowUrl: `${context.serverUrl || 'https://github.com'}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId || process.env['GITHUB_RUN_ID'] || '0'}`,
      repository: `${context.repo.owner}/${context.repo.repo}`,
      prNumber: context.payload.pull_request?.number,
    };

    // S085: Log warning for high suppression count
    if (allSuppressions.length > 5) {
      core.warning(
        `> 5 suppressions (${allSuppressions.length}) — review justifications in .hawkyignore`
      );
    }

    // Post PR comment
    const commentResult = await postPRComment(reportData, inputs.githubToken);
    if (commentResult.success) {
      if (commentResult.commentId) {
        core.info(`PR comment posted (ID: ${commentResult.commentId})`);
      } else {
        core.info('Not in PR context — skipped PR comment');
      }
    } else {
      core.warning(`Failed to post PR comment: ${commentResult.error}`);
    }

    core.endGroup();

    // S105: Generate step summary
    core.startGroup('Generating Step Summary');
    const summaryResult = await writeStepSummary(reportData);
    if (summaryResult.success) {
      core.info('Step summary written to GITHUB_STEP_SUMMARY');
    } else {
      core.warning(`Failed to write step summary: ${summaryResult.error}`);
    }
    core.endGroup();

    // Set outputs
    core.setOutput('status', overallStatus);
    core.setOutput('gates_passed', gatesPassed);
    core.setOutput('gates_failed', gatesFailed);

    // Summary
    core.info('');
    core.info('='.repeat(50));
    core.info(`Hawky Summary: ${gatesPassed} passed, ${gatesFailed} failed`);
    core.info(`Overall Status: ${overallStatus.toUpperCase()}`);
    core.info('='.repeat(50));

    // Fail the action if any blocking gate failed
    if (hasBlockingFailure) {
      core.setFailed(`Hawky found blocking violations`);
    } else {
      core.info('Hawky completed successfully');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Hawky failed: ${error.message}`);
    } else {
      core.setFailed('Hawky failed with an unknown error');
    }
  }
}

// Run the action
run();
