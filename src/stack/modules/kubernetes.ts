/**
 * Kubernetes Stack Module
 *
 * S094: Stack module for Kubernetes/Helm/Kustomize projects.
 * Provides dry-run validation commands.
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
 * Kubernetes deployment type
 */
type K8sType = 'kustomize' | 'helm' | 'plain';

/**
 * Check if kubectl is available
 */
async function checkKubectlAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    let output = '';
    await exec.exec('kubectl', ['version', '--client'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return { available: output.includes('Client Version') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: message };
  }
}

/**
 * Check if helm is available
 */
async function checkHelmAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    let output = '';
    await exec.exec('helm', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    return { available: output.includes('Version') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { available: false, error: message };
  }
}

/**
 * Detect Kubernetes deployment type
 */
function detectK8sType(rootDir: string): K8sType {
  // Check for Helm
  if (
    fs.existsSync(path.join(rootDir, 'Chart.yaml')) ||
    fs.existsSync(path.join(rootDir, 'Chart.yml'))
  ) {
    return 'helm';
  }

  // Check for Kustomize
  if (
    fs.existsSync(path.join(rootDir, 'kustomization.yaml')) ||
    fs.existsSync(path.join(rootDir, 'kustomization.yml'))
  ) {
    return 'kustomize';
  }

  // Default to plain manifests
  return 'plain';
}

/**
 * Find YAML files in directory
 */
function findYamlFiles(rootDir: string): string[] {
  const yamlFiles: string[] = [];

  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        yamlFiles.push(path.join(rootDir, entry.name));
      }
    }
  } catch {
    // Ignore errors
  }

  return yamlFiles;
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
 * Kubernetes Stack Module
 */
export const kubernetesStackModule: StackModule = {
  name: 'kubernetes',
  displayName: 'Kubernetes',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for kustomization.yaml
    if (fs.existsSync(path.join(rootDir, 'kustomization.yaml'))) {
      markers.push('kustomization.yaml');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found kustomization.yaml');
    }
    if (fs.existsSync(path.join(rootDir, 'kustomization.yml'))) {
      markers.push('kustomization.yml');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found kustomization.yml');
    }

    // Check for Chart.yaml (Helm)
    if (fs.existsSync(path.join(rootDir, 'Chart.yaml'))) {
      markers.push('Chart.yaml');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found Chart.yaml (Helm)');
    }
    if (fs.existsSync(path.join(rootDir, 'Chart.yml'))) {
      markers.push('Chart.yml');
      confidence = Math.max(confidence, 0.95);
      reasons.push('found Chart.yml (Helm)');
    }

    // Check for helmfile.yaml
    if (fs.existsSync(path.join(rootDir, 'helmfile.yaml'))) {
      markers.push('helmfile.yaml');
      confidence = Math.max(confidence, 0.9);
      reasons.push('found helmfile.yaml');
    }

    // Check for k8s directory
    if (fs.existsSync(path.join(rootDir, 'k8s'))) {
      markers.push('k8s/');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found k8s directory');
    }

    // Check for kubernetes directory
    if (fs.existsSync(path.join(rootDir, 'kubernetes'))) {
      markers.push('kubernetes/');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found kubernetes directory');
    }

    if (markers.length === 0) {
      return null;
    }

    return {
      type: 'kubernetes',
      confidence,
      reason: reasons.join(', '),
      markers,
      rootDir,
    };
  },

  async getBuildCommand(rootDir: string): Promise<string | null> {
    const k8sType = detectK8sType(rootDir);

    switch (k8sType) {
      case 'helm':
        return 'helm lint .';
      case 'kustomize':
        return 'kubectl kustomize .';
      case 'plain':
      default:
        return 'kubectl apply --dry-run=client -f .';
    }
  },

  async getTestCommand(_rootDir: string): Promise<string | null> {
    // Kubernetes doesn't have standard test commands
    return null;
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    // Future: 'kubeval' or 'kubeconform'
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    // Future: 'kubesec' or 'polaris audit'
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();
    const k8sType = detectK8sType(rootDir);

    if (k8sType === 'helm') {
      // Check if Helm is available
      const helmCheck = await checkHelmAvailable();
      if (!helmCheck.available) {
        return {
          stack: 'kubernetes',
          gateType: 'build',
          gate: 'kubernetes-build',
          status: 'skip',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `Helm not available: ${helmCheck.error ?? 'not installed'}`,
          command: 'helm lint .',
        };
      }

      const buildCmd = 'helm lint .';
      core.info(`Running Helm lint: ${buildCmd}`);

      const result = await executeCommand('helm', ['lint', '.'], rootDir, timeoutMs);

      if (result.timedOut) {
        return {
          stack: 'kubernetes',
          gateType: 'build',
          gate: 'kubernetes-build',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: result.timeMs,
          message: `Helm lint timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: result.stdout + result.stderr,
          command: buildCmd,
        };
      }

      const passed = result.exitCode === 0;

      return {
        stack: 'kubernetes',
        gateType: 'build',
        gate: 'kubernetes-build',
        status: passed ? 'pass' : 'fail',
        totalViolations: passed ? 0 : 1,
        newViolations: passed ? 0 : 1,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: passed ? 'Helm lint passed' : 'Helm lint failed',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    // Check if kubectl is available
    const kubectlCheck = await checkKubectlAvailable();
    if (!kubectlCheck.available) {
      return {
        stack: 'kubernetes',
        gateType: 'build',
        gate: 'kubernetes-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `kubectl not available: ${kubectlCheck.error ?? 'not installed'}`,
        command: '',
      };
    }

    if (k8sType === 'kustomize') {
      const buildCmd = 'kubectl kustomize .';
      core.info(`Running Kustomize build: ${buildCmd}`);

      const result = await executeCommand(
        'kubectl',
        ['kustomize', '.'],
        rootDir,
        timeoutMs
      );

      if (result.timedOut) {
        return {
          stack: 'kubernetes',
          gateType: 'build',
          gate: 'kubernetes-build',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: result.timeMs,
          message: `Kustomize build timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: result.stdout + result.stderr,
          command: buildCmd,
        };
      }

      const passed = result.exitCode === 0;

      return {
        stack: 'kubernetes',
        gateType: 'build',
        gate: 'kubernetes-build',
        status: passed ? 'pass' : 'fail',
        totalViolations: passed ? 0 : 1,
        newViolations: passed ? 0 : 1,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: passed ? 'Kustomize build succeeded' : 'Kustomize build failed',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    // Plain manifests - dry run
    const yamlFiles = findYamlFiles(rootDir);
    if (yamlFiles.length === 0) {
      return {
        stack: 'kubernetes',
        gateType: 'build',
        gate: 'kubernetes-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No YAML files found',
        command: '',
      };
    }

    const buildCmd = 'kubectl apply --dry-run=client -f .';
    core.info(`Running kubectl dry-run: ${buildCmd}`);

    const result = await executeCommand(
      'kubectl',
      ['apply', '--dry-run=client', '-f', '.'],
      rootDir,
      timeoutMs
    );

    if (result.timedOut) {
      return {
        stack: 'kubernetes',
        gateType: 'build',
        gate: 'kubernetes-build',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Dry-run timed out after ${timeoutMs}ms`,
        error: 'Timeout',
        rawOutput: result.stdout + result.stderr,
        command: buildCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'kubernetes',
      gateType: 'build',
      gate: 'kubernetes-build',
      status: passed ? 'pass' : 'fail',
      totalViolations: passed ? 0 : 1,
      newViolations: passed ? 0 : 1,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: result.timeMs,
      message: passed ? 'Kubernetes dry-run passed' : 'Kubernetes dry-run failed',
      rawOutput: result.stdout + result.stderr,
      command: buildCmd,
    };
  },

  async runTests(_rootDir: string, _timeoutMs: number): Promise<StackGateResult> {
    // Kubernetes doesn't have standard test commands
    return {
      stack: 'kubernetes',
      gateType: 'test',
      gate: 'kubernetes-test',
      status: 'skip',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: 0,
      message: 'Kubernetes has no standard test command',
      command: '',
    };
  },
};

// Register the module
registerStackModule(kubernetesStackModule);

export default kubernetesStackModule;
