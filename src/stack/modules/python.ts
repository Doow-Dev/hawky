/**
 * Python Stack Module
 *
 * S091: Stack module for Python projects.
 * Detects package manager (pip, poetry, pipenv, uv) and provides build/test commands.
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
  PythonPackageManager,
} from '../types';
import { registerStackModule } from '../registry';

/**
 * Detect Python package manager from project files
 */
function detectPackageManager(rootDir: string): PythonPackageManager {
  // Check for uv (newest)
  if (fs.existsSync(path.join(rootDir, 'uv.lock'))) {
    return 'uv';
  }

  // Check for poetry
  if (fs.existsSync(path.join(rootDir, 'poetry.lock'))) {
    return 'poetry';
  }
  if (fs.existsSync(path.join(rootDir, 'pyproject.toml'))) {
    try {
      const content = fs.readFileSync(
        path.join(rootDir, 'pyproject.toml'),
        'utf-8'
      );
      if (content.includes('[tool.poetry]')) {
        return 'poetry';
      }
    } catch {
      // Ignore read errors
    }
  }

  // Check for pipenv
  if (
    fs.existsSync(path.join(rootDir, 'Pipfile')) ||
    fs.existsSync(path.join(rootDir, 'Pipfile.lock'))
  ) {
    return 'pipenv';
  }

  // Default to pip
  return 'pip';
}

/**
 * Check if a tool is available
 */
async function checkToolAvailable(
  tool: string
): Promise<{ available: boolean; error?: string }> {
  try {
    let output = '';
    await exec.exec(tool, ['--version'], {
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
 * Python Stack Module
 */
export const pythonStackModule: StackModule = {
  name: 'python',
  displayName: 'Python',

  async detect(rootDir: string): Promise<DetectedStack | null> {
    const markers: string[] = [];
    let confidence = 0;
    const reasons: string[] = [];

    // Check for pyproject.toml (modern Python)
    if (fs.existsSync(path.join(rootDir, 'pyproject.toml'))) {
      markers.push('pyproject.toml');
      confidence = Math.max(confidence, 0.9);
      reasons.push('found pyproject.toml');
    }

    // Check for setup.py (legacy)
    if (fs.existsSync(path.join(rootDir, 'setup.py'))) {
      markers.push('setup.py');
      confidence = Math.max(confidence, 0.85);
      reasons.push('found setup.py');
    }

    // Check for setup.cfg
    if (fs.existsSync(path.join(rootDir, 'setup.cfg'))) {
      markers.push('setup.cfg');
      confidence = Math.max(confidence, 0.7);
      reasons.push('found setup.cfg');
    }

    // Check for requirements.txt
    if (fs.existsSync(path.join(rootDir, 'requirements.txt'))) {
      markers.push('requirements.txt');
      confidence = Math.max(confidence, 0.75);
      reasons.push('found requirements.txt');
    }

    // Check for Pipfile
    if (fs.existsSync(path.join(rootDir, 'Pipfile'))) {
      markers.push('Pipfile');
      confidence = Math.max(confidence, 0.85);
      reasons.push('found Pipfile');
    }

    // Check for poetry.lock
    if (fs.existsSync(path.join(rootDir, 'poetry.lock'))) {
      markers.push('poetry.lock');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found poetry.lock');
    }

    // Check for uv.lock
    if (fs.existsSync(path.join(rootDir, 'uv.lock'))) {
      markers.push('uv.lock');
      confidence = Math.max(confidence, 0.8);
      reasons.push('found uv.lock');
    }

    if (markers.length === 0) {
      return null;
    }

    const pm = detectPackageManager(rootDir);

    return {
      type: 'python',
      confidence,
      reason: reasons.join(', '),
      markers,
      packageManager: pm,
      rootDir,
    };
  },

  async getBuildCommand(rootDir: string): Promise<string | null> {
    const pm = detectPackageManager(rootDir);

    switch (pm) {
      case 'poetry':
        return 'poetry install';
      case 'pipenv':
        return 'pipenv install';
      case 'uv':
        return 'uv sync';
      case 'pip':
      default:
        // Check if it's an installable package
        if (
          fs.existsSync(path.join(rootDir, 'setup.py')) ||
          fs.existsSync(path.join(rootDir, 'pyproject.toml'))
        ) {
          return 'pip install -e .';
        }
        // Just install requirements
        if (fs.existsSync(path.join(rootDir, 'requirements.txt'))) {
          return 'pip install -r requirements.txt';
        }
        return null;
    }
  },

  async getTestCommand(rootDir: string): Promise<string | null> {
    const pm = detectPackageManager(rootDir);

    // Check for pytest configuration
    const hasPytest =
      fs.existsSync(path.join(rootDir, 'pytest.ini')) ||
      fs.existsSync(path.join(rootDir, 'pyproject.toml')) ||
      fs.existsSync(path.join(rootDir, 'setup.cfg'));

    if (hasPytest) {
      // Check pyproject.toml for pytest config
      if (fs.existsSync(path.join(rootDir, 'pyproject.toml'))) {
        try {
          const content = fs.readFileSync(
            path.join(rootDir, 'pyproject.toml'),
            'utf-8'
          );
          if (
            content.includes('[tool.pytest') ||
            content.includes('pytest')
          ) {
            // Use the package manager's run command
            switch (pm) {
              case 'poetry':
                return 'poetry run pytest';
              case 'pipenv':
                return 'pipenv run pytest';
              case 'uv':
                return 'uv run pytest';
              default:
                return 'python -m pytest';
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    // Default to pytest
    switch (pm) {
      case 'poetry':
        return 'poetry run pytest';
      case 'pipenv':
        return 'pipenv run pytest';
      case 'uv':
        return 'uv run pytest';
      default:
        return 'python -m pytest';
    }
  },

  async getLintCommand(_rootDir: string): Promise<string | null> {
    // MVP: lint gates in future epic
    // Future: 'ruff check .' or 'flake8'
    return null;
  },

  async getSecurityCommand(_rootDir: string): Promise<string | null> {
    // MVP: security gates in future epic
    // Future: 'bandit -r .' or 'safety check'
    return null;
  },

  async runBuild(rootDir: string, timeoutMs: number): Promise<StackGateResult> {
    const startTime = Date.now();
    const pm = detectPackageManager(rootDir);

    const buildCmd = await this.getBuildCommand(rootDir);
    if (!buildCmd) {
      return {
        stack: 'python',
        gateType: 'build',
        gate: 'python-build',
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

    core.info(`Running Python build: ${buildCmd}`);

    // Check if tool is available
    const toolCheck = await checkToolAvailable(pm);
    if (!toolCheck.available && pm !== 'pip') {
      // Fall back to pip if specific tool not available
      core.info(`${pm} not available, falling back to pip`);
    }

    const parts = buildCmd.split(' ');
    const command = parts[0] ?? '';
    const args = parts.slice(1);

    const result = await executeCommand(command, args, rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'python',
        gateType: 'build',
        gate: 'python-build',
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
        stack: 'python',
        gateType: 'build',
        gate: 'python-build',
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
      stack: 'python',
      gateType: 'build',
      gate: 'python-build',
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

    const testCmd = await this.getTestCommand(rootDir);
    if (!testCmd) {
      return {
        stack: 'python',
        gateType: 'test',
        gate: 'python-test',
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

    core.info(`Running Python tests: ${testCmd}`);

    const parts = testCmd.split(' ');
    const command = parts[0] ?? '';
    const args = parts.slice(1);

    const result = await executeCommand(command, args, rootDir, timeoutMs);

    if (result.timedOut) {
      return {
        stack: 'python',
        gateType: 'test',
        gate: 'python-test',
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
        stack: 'python',
        gateType: 'test',
        gate: 'python-test',
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
      stack: 'python',
      gateType: 'test',
      gate: 'python-test',
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
registerStackModule(pythonStackModule);

export default pythonStackModule;
