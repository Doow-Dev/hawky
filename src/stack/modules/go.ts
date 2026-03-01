/**
 * Go Stack Module
 *
 * S089: Stack module for Go projects.
 * Detects Go modules and provides build/test commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type {
  StackModule,
  DetectedStack,
  StackGateResult,
  StackCommandResult,
} from '../types';
import { registerStackModule } from '../registry';

/**
 * Check if Go is available
 */
async function checkGoAvailable(): Promise<{ available: boolean; error?: string }> {
  try {
    let output = '';
    await exec.exec('go', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return { available: output.includes('go version') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: message };
  }
}

/**
 * Execute a command with timeout
 */
async function executeCommand(
  command: string,
  args: string[],
  rootDir: string,
  timeoutMs: number
): Promise<StackCommandResult> {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;

  try {
    const execPromise = exec.exec(command, args, {
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

    return {
      exitCode,
      stdout,
      stderr,
      timedOut,
      timeMs: Date.now() - startTime,
      toolAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      exitCode: -1,
      stdout,
      stderr,
      timedOut: false,
      timeMs: Date.now() - startTime,
      toolAvailable: false,
      toolError: message,
    };
  }
}

/**
 * Go Stack Module
 */
export const goStackModule: StackModule = {
  name: 'go',
  displayName: 'Go',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for go.mod (strongest indicator)
    if (fs.existsSync(path.join(rootDir, 'go.mod'))) {
      markers.push('go.mod');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found go.mod');
    }

    // Check for go.sum
    if (fs.existsSync(path.join(rootDir, 'go.sum'))) {
      markers.push('go.sum');
      confidence = Math.max(confidence, 0.7);
      reasons.push('found go.sum');
    }

    // Check for go.work (Go workspaces)
    if (fs.existsSync(path.join(rootDir, 'go.work'))) {
      markers.push('go.work');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found go.work');
    }

    if (markers.length === 0) {
      return null;
    }

    return {
      type: 'go',
      confidence,
      reason: reasons.join(', '),
      markers,
      rootDir,
    };
  },

  async getBuildCommand(_rootDir: string): Promise<string | null> {
    return 'go build ./...';
  },

  async getTestCommand(_rootDir: string): Promise<string | null> {
    return 'go test ./...';
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();
    const buildCmd = 'go build ./...';

    core.info(`Running Go build: ${buildCmd}`);

    // Check if Go is available
    const toolCheck = await checkGoAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'go',
        gateType: 'build',
        gate: 'go-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Go not available: ${toolCheck.error ?? 'not installed'}`,
        command: buildCmd,
      };
    }

    const result = await executeCommand('go', ['build', './...'], rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'go',
        gateType: 'build',
        gate: 'go-build',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Build timed out after ${timeoutMs}ms`,
        error: 'Timeout',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    if (!result.toolAvailable) {
      return {
        stack: 'go',
        gateType: 'build',
        gate: 'go-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Go not available: ${result.toolError ?? 'unknown error'}`,
        command: buildCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'go',
      gateType: 'build',
      gate: 'go-build',
      status: passed ? 'pass' : 'fail',
      totalViolations: passed ? 0 : 1,
      newViolations: passed ? 0 : 1,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: result.timeMs,
      message: passed ? 'Build succeeded' : 'Build failed',
      rawOutput: result.stdout + result.stderr,
      command: buildCmd,
    };
  },

  async runTests(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();
    const testCmd = 'go test ./...';

    core.info(`Running Go tests: ${testCmd}`);

    // Check if Go is available
    const toolCheck = await checkGoAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'go',
        gateType: 'test',
        gate: 'go-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Go not available: ${toolCheck.error ?? 'not installed'}`,
        command: testCmd,
      };
    }

    const result = await executeCommand('go', ['test', './...'], rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'go',
        gateType: 'test',
        gate: 'go-test',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Tests timed out after ${timeoutMs}ms`,
        error: 'Timeout',
        rawOutput: result.stdout + result.stderr,
        command: testCmd,
      };
    }

    if (!result.toolAvailable) {
      return {
        stack: 'go',
        gateType: 'test',
        gate: 'go-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Go not available: ${result.toolError ?? 'unknown error'}`,
        command: testCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'go',
      gateType: 'test',
      gate: 'go-test',
      status: passed ? 'pass' : 'fail',
      totalViolations: passed ? 0 : 1,
      newViolations: passed ? 0 : 1,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: result.timeMs,
      message: passed ? 'Tests passed' : 'Tests failed',
      rawOutput: result.stdout + result.stderr,
      command: testCmd,
    };
  },
};

// Register the module
registerStackModule(goStackModule);

export default goStackModule;
