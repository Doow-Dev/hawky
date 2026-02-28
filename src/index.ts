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
import {
  typescriptGate,
  eslintGate,
  violationToAnnotation,
  type GateResult,
  type Violation,
  type Annotation,
} from './gates';

/**
 * Parsed action inputs
 */
interface HawkyInputs {
  failFast: boolean;
  gates: string[];
  configPath: string;
  githubToken: string;
}

/**
 * Read and parse action inputs from workflow
 */
function getInputs(): HawkyInputs {
  const failFastRaw = core.getInput('fail_fast', { required: false });
  const gatesRaw = core.getInput('gates', { required: false });
  const configPath = core.getInput('config_path', { required: false });
  const githubToken = core.getInput('github_token', { required: false });

  // Parse fail_fast as boolean (default: true)
  const failFast = failFastRaw.toLowerCase() !== 'false';

  // Parse gates as comma-separated list
  const gates = gatesRaw
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g.length > 0);

  return {
    failFast,
    gates,
    configPath: configPath || '.hawky.yml',
    githubToken,
  };
}

/**
 * Filter violations through baseline and hawkyignore
 * Returns updated GateResult with correct counts and filtered annotations
 */
function filterViolations(
  result: GateResult,
  baseline: Baseline | null,
  ignorePatterns: IgnorePattern[],
  cwd: string
): GateResult {
  const newViolations: Violation[] = [];
  const existingViolations: Violation[] = [];
  const ignoredViolations: Violation[] = [];
  const newAnnotations: Annotation[] = [];

  for (const violation of result.violations) {
    // Check hawkyignore first
    const gatePrefix = `${violation.gate}:${violation.ruleId}`;
    const ignoreResult = shouldIgnore(violation.file, gatePrefix, ignorePatterns);

    if (ignoreResult.ignored) {
      ignoredViolations.push(violation);
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

  // Determine status based on new violations only
  const status = newViolations.length > 0 ? 'fail' : 'pass';
  const message =
    newViolations.length > 0
      ? `${newViolations.length} new error(s) found (${existingViolations.length} existing, ${ignoredViolations.length} ignored)`
      : existingViolations.length > 0
        ? `No new errors (${existingViolations.length} existing in baseline)`
        : result.message;

  return {
    ...result,
    status,
    newViolations: newViolations.length,
    existingViolations: existingViolations.length,
    ignoredViolations: ignoredViolations.length,
    annotations: newAnnotations,
    message,
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
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    core.info('Hawky starting...');

    // Read inputs
    const inputs = getInputs();

    core.info(`Configuration:`);
    core.info(`  - Fail fast: ${inputs.failFast}`);
    core.info(`  - Gates: ${inputs.gates.join(', ')}`);
    core.info(`  - Config path: ${inputs.configPath}`);

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
          result = filterViolations(result, baseline, ignorePatterns, cwd);
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
          result = filterViolations(result, baseline, ignorePatterns, cwd);
        }
      } else {
        // TODO(@Luna, 2026-02-28): S102-S103 - Other gates
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

    // TODO(@Luna, 2026-02-28): S104 - Generate PR comment
    // TODO(@Luna, 2026-02-28): S105 - Generate step summary

    // Set outputs
    const overallStatus = hasBlockingFailure ? 'fail' : 'pass';
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
