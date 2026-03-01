/**
 * Terraform Stack Module
 *
 * S092: Stack module for Terraform/OpenTofu projects.
 * Provides init, validate, and plan commands.
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
 * Check if Terraform is available
 */
async function checkTerraformAvailable(): Promise<{
  available: boolean;
  error?: string;
  tool?: 'terraform' | 'tofu';
}> {
  // Try terraform first
  try {
    let output = '';
    await exec.exec('terraform', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    if (output.includes('Terraform')) {
      return { available: true, tool: 'terraform' };
    }
  } catch {
    // Try OpenTofu as fallback
  }

  // Try tofu (OpenTofu)
  try {
    let output = '';
    await exec.exec('tofu', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    if (output.includes('OpenTofu') || output.includes('tofu')) {
      return { available: true, tool: 'tofu' };
    }
  } catch {
    // Neither available
  }

  return { available: false, error: 'Neither terraform nor tofu found' };
}

/**
 * Check if directory has .tf files
 */
function hasTfFiles(rootDir: string): boolean {
  try {
    const entries = fs.readdirSync(rootDir);
    return entries.some((e) => e.endsWith('.tf'));
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
 * Terraform Stack Module
 */
export const terraformStackModule: StackModule = {
  name: 'terraform',
  displayName: 'Terraform',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for main.tf
    if (fs.existsSync(path.join(rootDir, 'main.tf'))) {
      markers.push('main.tf');
      confidence = Math.max(confidence, 0.9);
      reasons.push('found main.tf');
    }

    // Check for terraform.tf
    if (fs.existsSync(path.join(rootDir, 'terraform.tf'))) {
      markers.push('terraform.tf');
      confidence = Math.max(confidence, 0.9);
      reasons.push('found terraform.tf');
    }

    // Check for versions.tf
    if (fs.existsSync(path.join(rootDir, 'versions.tf'))) {
      markers.push('versions.tf');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found versions.tf');
    }

    // Check for .terraform.lock.hcl
    if (fs.existsSync(path.join(rootDir, '.terraform.lock.hcl'))) {
      markers.push('.terraform.lock.hcl');
      confidence = Math.max(confidence, 0.85);
      reasons.push('found .terraform.lock.hcl');
    }

    // Check for .terraform directory
    if (fs.existsSync(path.join(rootDir, '.terraform'))) {
      markers.push('.terraform');
      confidence = Math.max(confidence, 0.7);
      reasons.push('found .terraform directory');
    }

    // Check for any .tf files
    if (markers.length === 0 && hasTfFiles(rootDir)) {
      markers.push('*.tf');
      confidence = 0.8;
      reasons.push('found .tf files');
    }

    if (markers.length === 0) {
      return null;
    }

    return {
      type: 'terraform',
      confidence,
      reason: reasons.join(', '),
      markers,
      rootDir,
    };
  },

  async getBuildCommand(_rootDir: string): Promise<string | null> {
    // Build for Terraform = init + validate
    return 'terraform init && terraform validate';
  },

  async getTestCommand(_rootDir: string): Promise<string | null> {
    // Test for Terraform = plan (dry run)
    return 'terraform plan';
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    // Future: 'terraform fmt -check' or 'tflint'
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    // Future: 'tfsec' or 'checkov'
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();

    // Check if Terraform is available
    const toolCheck = await checkTerraformAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'terraform',
        gateType: 'build',
        gate: 'terraform-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Terraform not available: ${toolCheck.error ?? 'not installed'}`,
        command: 'terraform init && terraform validate',
      };
    }

    const tool = toolCheck.tool ?? 'terraform';
    const buildCmd = `${tool} init && ${tool} validate`;

    core.info(`Running Terraform build: ${buildCmd}`);

    // Run init first
    const initResult = await executeCommand(
      tool,
      ['init', '-input=false'],
      rootDir,
      timeoutMs / 2
    );

    if (initResult.timedOut) {
      return {
        stack: 'terraform',
        gateType: 'build',
        gate: 'terraform-build',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: initResult.timeMs,
        message: `Init timed out after ${timeoutMs / 2}ms`,
        error: 'Timeout',
        rawOutput: initResult.stdout + initResult.stderr,
        command: buildCmd,
      };
    }

    if (initResult.exitCode !== 0) {
      return {
        stack: 'terraform',
        gateType: 'build',
        gate: 'terraform-build',
        status: 'fail',
        totalViolations: 1,
        newViolations: 1,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: initResult.timeMs,
        message: 'Terraform init failed',
        rawOutput: initResult.stdout + initResult.stderr,
        command: buildCmd,
      };
    }

    // Run validate
    const validateResult = await executeCommand(
      tool,
      ['validate'],
      rootDir,
      timeoutMs / 2
    );

    const totalTime = initResult.timeMs + validateResult.timeMs;

    if (validateResult.timedOut) {
      return {
        stack: 'terraform',
        gateType: 'build',
        gate: 'terraform-build',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: totalTime,
        message: `Validate timed out after ${timeoutMs / 2}ms`,
        error: 'Timeout',
        rawOutput: initResult.stdout + initResult.stderr + validateResult.stdout + validateResult.stderr,
        command: buildCmd,
      };
    }

    const passed = validateResult.exitCode === 0;

    return {
      stack: 'terraform',
      gateType: 'build',
      gate: 'terraform-build',
      status: passed ? 'pass' : 'fail',
      totalViolations: passed ? 0 : 1,
      newViolations: passed ? 0 : 1,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: totalTime,
      message: passed ? 'Terraform validate passed' : 'Terraform validate failed',
      rawOutput: initResult.stdout + initResult.stderr + validateResult.stdout + validateResult.stderr,
      command: buildCmd,
    };
  },

  async runTests(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();

    // Check if Terraform is available
    const toolCheck = await checkTerraformAvailable();
    if (!toolCheck.available) {
      return {
        stack: 'terraform',
        gateType: 'test',
        gate: 'terraform-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `Terraform not available: ${toolCheck.error ?? 'not installed'}`,
        command: 'terraform plan',
      };
    }

    const tool = toolCheck.tool ?? 'terraform';
    const testCmd = `${tool} plan`;

    core.info(`Running Terraform test (plan): ${testCmd}`);

    // Run plan (requires init first, assume build has run)
    const result = await executeCommand(
      tool,
      ['plan', '-input=false', '-detailed-exitcode'],
      rootDir,
      timeoutMs
    );

    if (result.timedOut) {
      return {
        stack: 'terraform',
        gateType: 'test',
        gate: 'terraform-test',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Plan timed out after ${timeoutMs}ms`,
        error: 'Timeout',
        rawOutput: result.stdout + result.stderr,
        command: testCmd,
      };
    }

    if (!result.toolAvailable) {
      return {
        stack: 'terraform',
        gateType: 'test',
        gate: 'terraform-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Terraform not available: ${result.toolError ?? 'unknown error'}`,
        command: testCmd,
      };
    }

    // Exit code 0 = no changes, 2 = changes present, other = error
    const passed = result.exitCode === 0 || result.exitCode === 2;

    return {
      stack: 'terraform',
      gateType: 'test',
      gate: 'terraform-test',
      status: passed ? 'pass' : 'fail',
      totalViolations: passed ? 0 : 1,
      newViolations: passed ? 0 : 1,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: result.timeMs,
      message: passed
        ? result.exitCode === 0
          ? 'No changes detected'
          : 'Plan succeeded (changes detected)'
        : 'Terraform plan failed',
      rawOutput: result.stdout + result.stderr,
      command: testCmd,
    };
  },
};

// Register the module
registerStackModule(terraformStackModule);

export default terraformStackModule;
