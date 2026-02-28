/**
 * Hawky - AI-Powered Code Quality Gates
 *
 * Main entry point for the GitHub Action.
 * Reads inputs, orchestrates gates, and reports results.
 */

import * as core from '@actions/core';

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

    // Log start group for gate execution
    core.startGroup('Gate Configuration');
    core.info(`Running ${inputs.gates.length} gates:`);
    for (const gate of inputs.gates) {
      core.info(`  - ${gate}`);
    }
    core.endGroup();

    // TODO(@Luna, 2026-02-28): S097 - Load and parse config from configPath
    // TODO(@Luna, 2026-02-28): S098 - Load baseline for comparison
    // TODO(@Luna, 2026-02-28): S099 - Load hawkyignore patterns
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
