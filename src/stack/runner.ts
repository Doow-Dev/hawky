/**
 * Stack Runner
 *
 * S095: Coordinates detection and execution of stack gates across multiple stacks.
 * Handles polyglot repos gracefully with tool-not-found fallbacks.
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type {
  StackType,
  StackGateResult,
  StackRunResult,
  StacksConfig,
  StackOverrideConfig,
  StackModule,
} from './types';
import { detectStacks } from './detector';
import { getStackModule, getAllStackModules } from './registry';

// Import modules to ensure they're registered
import './modules/index';

/**
 * Default timeout for stack commands (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Run stack gates for a repository
 *
 * @param rootDir - Repository root directory
 * @param config - Stack configuration from .hawky.yml
 * @returns Results from all stack gates
 */
export async function runStackGates(
  rootDir: string,
  config: StacksConfig = {}
): Promise<StackRunResult> {
  const startTime = Date.now();
  const { enabled = 'auto', disabled = [], overrides = {} } = config;

  core.info('Starting stack detection...');

  // Detect stacks
  const detected = await detectStacks(rootDir, {
    enabled,
    disabled,
    minConfidence: 0.5,
  });

  if (detected.length === 0) {
    core.info('No stacks detected in repository');
    return {
      detected: [],
      results: [],
      status: 'pass',
      skipped: [],
      timeMs: Date.now() - startTime,
    };
  }

  core.info(`Detected ${detected.length} stack(s): ${detected.map((s) => s.type).join(', ')}`);

  const results: StackGateResult[] = [];
  const skipped: Array<{ stack: StackType; reason: string }> = [];

  // Run gates for each detected stack
  for (const stack of detected) {
    const stackConfig = overrides[stack.type];

    // Check if stack is explicitly disabled
    if (stackConfig?.enabled === false) {
      core.info(`Skipping ${stack.type} (disabled in config)`);
      skipped.push({ stack: stack.type, reason: 'Disabled in config' });
      continue;
    }

    const module = getStackModule(stack.type);
    if (!module) {
      core.warning(`No module registered for stack type: ${stack.type}`);
      skipped.push({ stack: stack.type, reason: 'No module registered' });
      continue;
    }

    const timeoutMs = stackConfig?.timeout
      ? stackConfig.timeout * 1000
      : DEFAULT_TIMEOUT_MS;

    // Run build gate
    core.info(`Running ${stack.type} build gate...`);
    try {
      const buildResult = await runBuildWithOverride(
        module,
        rootDir,
        timeoutMs,
        stackConfig
      );
      results.push(buildResult);

      if (buildResult.status === 'skip') {
        core.info(`${stack.type} build skipped: ${buildResult.message}`);
      } else if (buildResult.status === 'pass') {
        core.info(`${stack.type} build passed (${buildResult.timeMs}ms)`);
      } else {
        core.warning(`${stack.type} build failed: ${buildResult.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.error(`${stack.type} build error: ${message}`);
      results.push({
        stack: stack.type,
        gateType: 'build',
        gate: `${stack.type}-build`,
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: 0,
        message: `Build error: ${message}`,
        error: message,
        command: '',
      });
    }

    // Run test gate
    core.info(`Running ${stack.type} test gate...`);
    try {
      const testResult = await runTestsWithOverride(
        module,
        rootDir,
        timeoutMs,
        stackConfig
      );
      results.push(testResult);

      if (testResult.status === 'skip') {
        core.info(`${stack.type} tests skipped: ${testResult.message}`);
      } else if (testResult.status === 'pass') {
        core.info(`${stack.type} tests passed (${testResult.timeMs}ms)`);
      } else {
        core.warning(`${stack.type} tests failed: ${testResult.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.error(`${stack.type} tests error: ${message}`);
      results.push({
        stack: stack.type,
        gateType: 'test',
        gate: `${stack.type}-test`,
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: 0,
        message: `Test error: ${message}`,
        error: message,
        command: '',
      });
    }
  }

  // Determine overall status
  const hasFailure = results.some((r) => r.status === 'fail');
  const hasError = results.some((r) => r.status === 'error');
  const overallStatus = hasFailure ? 'fail' : hasError ? 'error' : 'pass';

  const totalTime = Date.now() - startTime;
  core.info(`Stack gates completed in ${totalTime}ms (status: ${overallStatus})`);

  return {
    detected,
    results,
    status: overallStatus,
    skipped,
    timeMs: totalTime,
  };
}

/**
 * Run build with optional command override
 */
async function runBuildWithOverride(
  module: StackModule,
  rootDir: string,
  timeoutMs: number,
  config?: StackOverrideConfig
): Promise<StackGateResult> {
  // If custom build command is provided, use it
  if (config?.buildCommand) {
    return runCustomCommand(
      module.name,
      'build',
      config.buildCommand,
      rootDir,
      timeoutMs
    );
  }

  // Use module's default build
  return module.runBuild(rootDir, timeoutMs);
}

/**
 * Run tests with optional command override
 */
async function runTestsWithOverride(
  module: StackModule,
  rootDir: string,
  timeoutMs: number,
  config?: StackOverrideConfig
): Promise<StackGateResult> {
  // If custom test command is provided, use it
  if (config?.testCommand) {
    return runCustomCommand(
      module.name,
      'test',
      config.testCommand,
      rootDir,
      timeoutMs
    );
  }

  // Use module's default tests
  return module.runTests(rootDir, timeoutMs);
}

/**
 * Run a custom command
 */
async function runCustomCommand(
  stack: StackType,
  gateType: 'build' | 'test',
  command: string,
  rootDir: string,
  timeoutMs: number
): Promise<StackGateResult> {
  const startTime = Date.now();

  core.info(`Running custom ${gateType} command: ${command}`);

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;

  try {
    // Parse command - handle shell commands with arguments
    const parts = command.split(' ');
    const cmd = parts[0] ?? '';
    const args = parts.slice(1);

    const execPromise = exec.exec(cmd, args, {
      cwd: rootDir,
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString();
        },
        stderr: (data: Buffer) => {
          stderr += data.toString();
        },
      },
    });

    const timeoutPromise = new Promise<number>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(-1);
      }, timeoutMs);
    });

    exitCode = await Promise.race([execPromise, timeoutPromise]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      stack,
      gateType,
      gate: `${stack}-${gateType}`,
      status: 'error',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: Date.now() - startTime,
      message: `Command error: ${message}`,
      error: message,
      rawOutput: stdout + stderr,
      command,
    };
  }

  if (timedOut) {
    return {
      stack,
      gateType,
      gate: `${stack}-${gateType}`,
      status: 'error',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: Date.now() - startTime,
      message: `Command timed out after ${timeoutMs}ms`,
      error: 'Timeout',
      rawOutput: stdout + stderr,
      command,
    };
  }

  const passed = exitCode === 0;

  return {
    stack,
    gateType,
    gate: `${stack}-${gateType}`,
    status: passed ? 'pass' : 'fail',
    totalViolations: passed ? 0 : 1,
    newViolations: passed ? 0 : 1,
    existingViolations: 0,
    ignoredViolations: 0,
    annotations: [],
    violations: [],
    timeMs: Date.now() - startTime,
    message: passed
      ? `${gateType === 'build' ? 'Build' : 'Tests'} passed`
      : `${gateType === 'build' ? 'Build' : 'Tests'} failed`,
    rawOutput: stdout + stderr,
    command,
  };
}

/**
 * Run a single stack's gates
 */
export async function runSingleStackGates(
  stack: StackType,
  rootDir: string,
  config?: StackOverrideConfig
): Promise<StackGateResult[]> {
  const module = getStackModule(stack);
  if (!module) {
    throw new Error(`No module registered for stack type: ${stack}`);
  }

  const timeoutMs = config?.timeout ? config.timeout * 1000 : DEFAULT_TIMEOUT_MS;
  const results: StackGateResult[] = [];

  // Run build
  const buildResult = await runBuildWithOverride(module, rootDir, timeoutMs, config);
  results.push(buildResult);

  // Run tests
  const testResult = await runTestsWithOverride(module, rootDir, timeoutMs, config);
  results.push(testResult);

  return results;
}

/**
 * Get all registered stack modules
 */
export function getAvailableStacks(): StackModule[] {
  return getAllStackModules();
}

/**
 * Check if a stack can be detected in a directory
 */
export async function canDetectStack(
  stack: StackType,
  rootDir: string
): Promise<boolean> {
  const module = getStackModule(stack);
  if (!module) {
    return false;
  }

  const detection = await module.detect(rootDir);
  return detection !== null;
}
