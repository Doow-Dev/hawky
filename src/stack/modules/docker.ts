/**
 * Docker Stack Module
 *
 * S093: Stack module for Docker/container projects.
 * Provides build commands for Dockerfiles and docker-compose.
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
 * Check if Docker is available
 */
async function checkDockerAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    let output = '';
    await exec.exec('docker', ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return { available: output.includes('Docker') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: message };
  }
}

/**
 * Check if docker-compose is available
 */
async function checkComposeAvailable(): Promise<{
  available: boolean;
  command?: string;
  error?: string;
}> {
  // Try docker compose (v2, plugin)
  try {
    let output = '';
    await exec.exec('docker', ['compose', 'version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    if (output.includes('Docker Compose')) {
      return { available: true, command: 'docker compose' };
    }
  } catch {
    // Try legacy docker-compose
  }

  // Try docker-compose (v1, standalone)
  try {
    let output = '';
    await exec.exec('docker-compose', ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    if (output.includes('docker-compose')) {
      return { available: true, command: 'docker-compose' };
    }
  } catch {
    // Neither available
  }

  return { available: false, error: 'docker-compose not found' };
}

/**
 * Find compose file
 */
function findComposeFile(rootDir: string): string | null {
  const composeFiles = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];

  for (const file of composeFiles) {
    if (fs.existsSync(path.join(rootDir, file))) {
      return file;
    }
  }

  return null;
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
 * Docker Stack Module
 */
export const dockerStackModule: StackModule = {
  name: 'docker',
  displayName: 'Docker',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for Dockerfile
    if (fs.existsSync(path.join(rootDir, 'Dockerfile'))) {
      markers.push('Dockerfile');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found Dockerfile');
    }

    // Check for docker-compose files
    const composeFile = findComposeFile(rootDir);
    if (composeFile) {
      markers.push(composeFile);
      confidence = Math.max(confidence, 0.9);
      reasons.push(`found ${composeFile}`);
    }

    // Check for .dockerignore
    if (fs.existsSync(path.join(rootDir, '.dockerignore'))) {
      markers.push('.dockerignore');
      confidence = Math.max(confidence, 0.5);
      reasons.push('found .dockerignore');
    }

    if (markers.length === 0) {
      return null;
    }

    return {
      type: 'docker',
      confidence,
      reason: reasons.join(', '),
      markers,
      rootDir,
    };
  },

  async getBuildCommand(rootDir: string): Promise<string | null> {
    // Check for compose file first
    const composeFile = findComposeFile(rootDir);
    if (composeFile) {
      return `docker compose -f ${composeFile} build`;
    }

    // Check for Dockerfile
    if (fs.existsSync(path.join(rootDir, 'Dockerfile'))) {
      return 'docker build .';
    }

    return null;
  },

  async getTestCommand(_rootDir: string): Promise<string | null> {
    // Docker doesn't have a standard test command
    return null;
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    // Future: 'hadolint Dockerfile'
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    // Future: 'trivy image' or 'docker scan'
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();

    // Check if Docker is available
    const dockerCheck = await checkDockerAvailable();
    if (!dockerCheck.available) {
      return {
        stack: 'docker',
        gateType: 'build',
        gate: 'docker-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Docker not available: ${dockerCheck.error ?? 'not installed'}`,
        command: '',
      };
    }

    // Check for compose file
    const composeFile = findComposeFile(rootDir);

    if (composeFile) {
      // Use docker compose
      const composeCheck = await checkComposeAvailable();
      if (!composeCheck.available) {
        return {
          stack: 'docker',
          gateType: 'build',
          gate: 'docker-build',
          status: 'skip',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `docker-compose not available: ${composeCheck.error ?? 'not installed'}`,
          command: '',
        };
      }

      const buildCmd = `${composeCheck.command} -f ${composeFile} build`;
      core.info(`Running Docker Compose build: ${buildCmd}`);

      const parts = (composeCheck.command ?? 'docker compose').split(' ');
      const command = parts[0] ?? 'docker';
      const args = [...parts.slice(1), '-f', composeFile, 'build'];

      const result = await executeCommand(command, args, rootDir, timeoutMs);

      if (result.timedOut) {
        return {
          stack: 'docker',
          gateType: 'build',
          gate: 'docker-build',
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

      const passed = result.exitCode === 0;

      return {
        stack: 'docker',
        gateType: 'build',
        gate: 'docker-build',
        status: passed ? 'pass' : 'fail',
        totalViolations: passed ? 0 : 1,
        newViolations: passed ? 0 : 1,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: passed ? 'Docker Compose build succeeded' : 'Docker Compose build failed',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    // Check for Dockerfile
    if (fs.existsSync(path.join(rootDir, 'Dockerfile'))) {
      const buildCmd = 'docker build .';
      core.info(`Running Docker build: ${buildCmd}`);

      const result = await executeCommand(
        'docker',
        ['build', '.'],
        rootDir,
        timeoutMs
      );

      if (result.timedOut) {
        return {
          stack: 'docker',
          gateType: 'build',
          gate: 'docker-build',
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

      const passed = result.exitCode === 0;

      return {
        stack: 'docker',
        gateType: 'build',
        gate: 'docker-build',
        status: passed ? 'pass' : 'fail',
        totalViolations: passed ? 0 : 1,
        newViolations: passed ? 0 : 1,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: passed ? 'Docker build succeeded' : 'Docker build failed',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    return {
      stack: 'docker',
      gateType: 'build',
      gate: 'docker-build',
      status: 'skip',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: Date.now() - startTime,
      message: 'No Dockerfile or compose file found',
      command: '',
    };
  },

  async runTests(_rootDir: string, _timeoutMs: number): Promise<StackGateResult> {
    // Docker doesn't have standard test commands
    return {
      stack: 'docker',
      gateType: 'test',
      gate: 'docker-test',
      status: 'skip',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: 0,
      message: 'Docker has no standard test command',
      command: '',
    };
  },
};

// Register the module
registerStackModule(dockerStackModule);

export default dockerStackModule;
