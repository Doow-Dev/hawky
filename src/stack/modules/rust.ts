/**
 * Rust Stack Module
 *
 * S090: Stack module for Rust projects.
 * Detects Cargo projects and handles workspaces.
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
 * Check if Cargo is available
 */
async function checkCargoAvailable(): Promise<{ available: boolean; error?: string }> {
  try {
    let output = '';
    await exec.exec('cargo', ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return { available: output.includes('cargo') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: message };
  }
}

/**
 * Check if this is a workspace project
 */
function isWorkspace(rootDir: string): boolean {
  const cargoTomlPath = path.join(rootDir, 'Cargo.toml');
  if (!fs.existsSync(cargoTomlPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(cargoTomlPath, 'utf-8');
    return content.includes('[workspace]');
  } catch {
    return false;
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
 * Rust Stack Module
 */
export const rustStackModule: StackModule = {
  name: 'rust',
  displayName: 'Rust',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for Cargo.toml (strongest indicator)
    if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) {
      markers.push('Cargo.toml');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found Cargo.toml');

      // Note if it's a workspace
      if (isWorkspace(rootDir)) {
        reasons.push('workspace project');
      }
    }

    // Check for Cargo.lock
    if (fs.existsSync(path.join(rootDir, 'Cargo.lock'))) {
      markers.push('Cargo.lock');
      confidence = Math.max(confidence, 0.7);
      reasons.push('found Cargo.lock');
    }

    // Check for rust-toolchain.toml
    if (fs.existsSync(path.join(rootDir, 'rust-toolchain.toml'))) {
      markers.push('rust-toolchain.toml');
      confidence = Math.max(confidence, 0.6);
      reasons.push('found rust-toolchain.toml');
    }

    // Check for rust-toolchain (legacy)
    if (fs.existsSync(path.join(rootDir, 'rust-toolchain'))) {
      markers.push('rust-toolchain');
      confidence = Math.max(confidence, 0.5);
      reasons.push('found rust-toolchain');
    }

    if (markers.length === 0) {
      return null;
    }

    return {
      type: 'rust',
      confidence,
      reason: reasons.join(', '),
      markers,
      rootDir,
    };
  },

  async getBuildCommand(_rootDir: string): Promise<string | null> {
    return 'cargo build';
  },

  async getTestCommand(_rootDir: string): Promise<string | null> {
    return 'cargo test';
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    // Future: 'cargo clippy'
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    // Future: 'cargo audit'
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();
    const buildCmd = 'cargo build';

    core.info(`Running Rust build: ${buildCmd}`);

    // Check if Cargo is available
    const toolCheck = await checkCargoAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'rust',
        gateType: 'build',
        gate: 'rust-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Cargo not available: ${toolCheck.error ?? 'not installed'}`,
        command: buildCmd,
      };
    }

    const result = await executeCommand('cargo', ['build'], rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'rust',
        gateType: 'build',
        gate: 'rust-build',
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
        stack: 'rust',
        gateType: 'build',
        gate: 'rust-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Cargo not available: ${result.toolError ?? 'unknown error'}`,
        command: buildCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'rust',
      gateType: 'build',
      gate: 'rust-build',
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
    const testCmd = 'cargo test';

    core.info(`Running Rust tests: ${testCmd}`);

    // Check if Cargo is available
    const toolCheck = await checkCargoAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'rust',
        gateType: 'test',
        gate: 'rust-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Cargo not available: ${toolCheck.error ?? 'not installed'}`,
        command: testCmd,
      };
    }

    const result = await executeCommand('cargo', ['test'], rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'rust',
        gateType: 'test',
        gate: 'rust-test',
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
        stack: 'rust',
        gateType: 'test',
        gate: 'rust-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Cargo not available: ${result.toolError ?? 'unknown error'}`,
        command: testCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'rust',
      gateType: 'test',
      gate: 'rust-test',
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
registerStackModule(rustStackModule);

export default rustStackModule;
