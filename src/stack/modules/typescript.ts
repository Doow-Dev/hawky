/**
 * TypeScript Stack Module
 *
 * S088: Stack module for TypeScript/JavaScript projects.
 * Detects package manager and provides build/test commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type {
  StackModule,
  DetectedStack,
  StackGateResult,
  NodePackageManager,
  StackCommandResult,
} from '../types';
import { registerStackModule } from '../registry';

/**
 * Detect Node.js package manager from lockfiles
 */
function detectPackageManager(rootDir: string): NodePackageManager {
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  }
  // Default to npm
  return 'npm';
}

/**
 * Get the run command prefix for a package manager
 */
function getRunCommand(pm: NodePackageManager): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm';
    case 'yarn':
      return 'yarn';
    case 'npm':
    default:
      return 'npm run';
  }
}

/**
 * Check if package.json has a script
 */
function hasScript(rootDir: string, scriptName: string): boolean {
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg: unknown = JSON.parse(content);
    if (typeof pkg !== 'object' || pkg === null) {
      return false;
    }
    const pkgObj = pkg as Record<string, unknown>;
    const scripts = pkgObj['scripts'];
    if (typeof scripts !== 'object' || scripts === null) {
      return false;
    }
    return scriptName in scripts;
  } catch {
    return false;
  }
}

/**
 * Check if TypeScript is available
 */
async function checkToolAvailable(
  rootDir: string,
  tool: string
): Promise<{ available: boolean; error?: string }> {
  try {
    const pm = detectPackageManager(rootDir);
    const npxCmd = pm === 'pnpm' ? 'pnpm exec' : pm === 'yarn' ? 'yarn' : 'npx';

    let output = '';
    await exec.exec(npxCmd, [tool, '--version'], {
      cwd: rootDir,
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
        stderr: (data: Buffer) => {
          output += data.toString();
        },
      },
    });

    return { available: true };
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
 * TypeScript Stack Module
 */
export const typescriptStackModule: StackModule = {
  name: 'typescript',
  displayName: 'TypeScript',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for tsconfig.json (strongest indicator)
    if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
      markers.push('tsconfig.json');
      confidence = Math.max(confidence, 0.9);
      reasons.push('found tsconfig.json');
    }

    // Check for TypeScript in package.json dependencies
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        if (content.includes('"typescript"')) {
          markers.push('package.json (typescript dep)');
          confidence = Math.max(confidence, 0.8);
          reasons.push('typescript in dependencies');
        }
      } catch {
        // Ignore read errors
      }
    }

    // Check for .ts/.tsx files
    if (fs.existsSync(path.join(rootDir, 'src'))) {
      try {
        const srcFiles = fs.readdirSync(path.join(rootDir, 'src'));
        const hasTs = srcFiles.some(
          (f) => f.endsWith('.ts') || f.endsWith('.tsx')
        );
        if (hasTs) {
          markers.push('src/*.ts');
          confidence = Math.max(confidence, 0.7);
          reasons.push('found TypeScript files');
        }
      } catch {
        // Ignore read errors
      }
    }

    if (markers.length === 0) {
      return null;
    }

    const pm = detectPackageManager(rootDir);

    return {
      type: 'typescript',
      confidence,
      reason: reasons.join(', '),
      markers,
      packageManager: pm,
      rootDir,
    };
  },

  async getBuildCommand(rootDir: string): Promise<string | null> {
    const pm = detectPackageManager(rootDir);
    const runCmd = getRunCommand(pm);

    // Check for build script in package.json
    if (hasScript(rootDir, 'build')) {
      return `${runCmd} build`;
    }

    // Check for tsc as fallback
    if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
      const npxCmd = pm === 'pnpm' ? 'pnpm exec' : pm === 'yarn' ? 'yarn' : 'npx';
      return `${npxCmd} tsc --noEmit`;
    }

    return null;
  },

  async getTestCommand(rootDir: string): Promise<string | null> {
    const pm = detectPackageManager(rootDir);

    // Check for test script in package.json
    if (hasScript(rootDir, 'test')) {
      // npm run test vs yarn test vs pnpm test
      if (pm === 'npm') {
        return 'npm test';
      }
      return `${pm} test`;
    }

    return null;
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

    // Get build command
    const buildCmd = await this.getBuildCommand(rootDir);
    if (!buildCmd) {
      return {
        stack: 'typescript',
        gateType: 'build',
        gate: 'typescript-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No build command found',
        command: '',
      };
    }

    core.info(`Running TypeScript build: ${buildCmd}`);

    // Parse command into parts
    const parts = buildCmd.split(' ');
    const command = parts[0] ?? '';
    const args = parts.slice(1);

    // Check if tool is available
    const toolCheck = await checkToolAvailable(rootDir, 'tsc');
    if (!toolCheck.available && buildCmd.includes('tsc')) {
      return {
        stack: 'typescript',
        gateType: 'build',
        gate: 'typescript-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: `TypeScript compiler not available: ${toolCheck.error ?? 'unknown error'}`,
        command: buildCmd,
      };
    }

    const result = await executeCommand(command, args, rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'typescript',
        gateType: 'build',
        gate: 'typescript-build',
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
        stack: 'typescript',
        gateType: 'build',
        gate: 'typescript-build',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Tool not available: ${result.toolError ?? 'unknown error'}`,
        command: buildCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'typescript',
      gateType: 'build',
      gate: 'typescript-build',
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

    // Get test command
    const testCmd = await this.getTestCommand(rootDir);
    if (!testCmd) {
      return {
        stack: 'typescript',
        gateType: 'test',
        gate: 'typescript-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No test command found',
        command: '',
      };
    }

    core.info(`Running TypeScript tests: ${testCmd}`);

    // Parse command into parts
    const parts = testCmd.split(' ');
    const command = parts[0] ?? '';
    const args = parts.slice(1);

    const result = await executeCommand(command, args, rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'typescript',
        gateType: 'test',
        gate: 'typescript-test',
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
        stack: 'typescript',
        gateType: 'test',
        gate: 'typescript-test',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: result.timeMs,
        message: `Tool not available: ${result.toolError ?? 'unknown error'}`,
        command: testCmd,
      };
    }

    const passed = result.exitCode === 0;

    return {
      stack: 'typescript',
      gateType: 'test',
      gate: 'typescript-test',
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
registerStackModule(typescriptStackModule);

export default typescriptStackModule;
