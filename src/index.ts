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
  type Baseline,
  type BaselineLoadResult,
} from './baseline';
import {
  loadIgnoreFromCwd,
  getPatternSummary,
  type IgnorePattern,
  type IgnoreLoadResult,
} from './ignore';

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

    // TODO(@Luna, 2026-02-28): S100-S103 - Run individual gates
    // TODO(@Luna, 2026-02-28): S104 - Generate PR comment
    // TODO(@Luna, 2026-02-28): S105 - Generate step summary

    // Placeholder outputs (will be populated by gate results)
    core.setOutput('status', 'pass');
    core.setOutput('gates_passed', inputs.gates.length);
    core.setOutput('gates_failed', 0);

    core.info('Hawky completed successfully (scaffold mode)');
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
