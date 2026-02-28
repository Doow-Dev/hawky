/**
 * ESLint Gate
 *
 * Runs ESLint with `--format json` on PR-changed files.
 * - Errors (severity 2) are blocking
 * - Warnings (severity 1) are non-blocking
 * - Integrates with baseline and hawkyignore
 *
 * ESLint JSON format:
 * [{ filePath, messages: [{ ruleId, severity, message, line, column }], errorCount, warningCount }]
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * ESLint config file names to check (in priority order)
 */
const ESLINT_CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
];

/**
 * File extensions to lint
 */
const LINTABLE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

/**
 * ESLint message from JSON output
 */
interface ESLintMessage {
  ruleId: string | null;
  severity: 1 | 2; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * ESLint file result from JSON output
 */
interface ESLintFileResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
}

/**
 * Parse ESLint JSON output into violations
 */
export function parseESLintOutput(output: string, cwd: string): Violation[] {
  const violations: Violation[] = [];

  try {
    const results: ESLintFileResult[] = JSON.parse(output);

    if (!Array.isArray(results)) {
      core.debug('ESLint output is not an array');
      return violations;
    }

    for (const file of results) {
      if (!file.messages || !Array.isArray(file.messages)) {
        continue;
      }

      for (const msg of file.messages) {
        // Normalize file path to be relative to cwd
        let normalizedPath = file.filePath;
        if (path.isAbsolute(normalizedPath)) {
          normalizedPath = path.relative(cwd, normalizedPath);
        }
        // Normalize path separators to forward slashes
        normalizedPath = normalizedPath.replace(/\\/g, '/');

        violations.push({
          ruleId: msg.ruleId || 'unknown',
          file: normalizedPath,
          line: msg.line || 1,
          column: msg.column || 1,
          message: msg.message || '',
          gate: 'eslint',
          // Store severity for annotation creation
        });
      }
    }
  } catch (error) {
    core.debug(`Failed to parse ESLint JSON output: ${error}`);
  }

  return violations;
}

/**
 * Parse ESLint output and separate errors from warnings
 */
export function parseESLintOutputWithSeverity(
  output: string,
  cwd: string
): { errors: Violation[]; warnings: Violation[] } {
  const errors: Violation[] = [];
  const warnings: Violation[] = [];

  try {
    const results: ESLintFileResult[] = JSON.parse(output);

    if (!Array.isArray(results)) {
      core.debug('ESLint output is not an array');
      return { errors, warnings };
    }

    for (const file of results) {
      if (!file.messages || !Array.isArray(file.messages)) {
        continue;
      }

      for (const msg of file.messages) {
        // Normalize file path to be relative to cwd
        let normalizedPath = file.filePath;
        if (path.isAbsolute(normalizedPath)) {
          normalizedPath = path.relative(cwd, normalizedPath);
        }
        // Normalize path separators to forward slashes
        normalizedPath = normalizedPath.replace(/\\/g, '/');

        const violation: Violation = {
          ruleId: msg.ruleId || 'unknown',
          file: normalizedPath,
          line: msg.line || 1,
          column: msg.column || 1,
          message: msg.message || '',
          gate: 'eslint',
          severity: msg.severity === 2 ? 'error' : 'warning',
        };

        if (msg.severity === 2) {
          errors.push(violation);
        } else {
          warnings.push(violation);
        }
      }
    }
  } catch (error) {
    core.debug(`Failed to parse ESLint JSON output: ${error}`);
  }

  return { errors, warnings };
}

/**
 * Convert a violation to a GitHub annotation
 */
export function violationToAnnotation(
  violation: Violation,
  severity: 'error' | 'warning'
): Annotation {
  const annotation: Annotation = {
    file: violation.file,
    line: violation.line,
    message: violation.message,
    severity,
    ruleId: violation.ruleId,
    title: `ESLint ${violation.ruleId}`,
  };
  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }
  return annotation;
}

/**
 * Find ESLint config file in project
 */
function findESLintConfig(cwd: string): string | null {
  // Check for config files
  for (const configFile of ESLINT_CONFIG_FILES) {
    const configPath = path.join(cwd, configFile);
    if (fs.existsSync(configPath)) {
      return configFile;
    }
  }

  // Check package.json for eslintConfig field
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.eslintConfig) {
        return 'package.json (eslintConfig)';
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Check if ESLint is available
 */
async function checkESLintAvailable(cwd: string): Promise<{ available: boolean; version?: string; reason?: string }> {
  // Check for ESLint config
  const configFile = findESLintConfig(cwd);
  if (!configFile) {
    return { available: false, reason: 'No ESLint configuration found' };
  }

  // Check if eslint is installed
  try {
    let version = '';
    await exec.exec('npx', ['eslint', '--version'], {
      cwd,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          version += data.toString();
        },
      },
    });
    return { available: true, version: version.trim() };
  } catch {
    return { available: false, reason: 'ESLint not installed' };
  }
}

/**
 * Get changed files from git diff
 * Returns JS/TS files changed between base branch and HEAD
 */
export async function getChangedFiles(cwd: string, baseBranch?: string): Promise<string[]> {
  const changedFiles: string[] = [];

  try {
    // Use environment variables to get base branch if not provided
    const base = baseBranch || process.env['GITHUB_BASE_REF'] || 'main';
    let output = '';

    // Get changed files between base branch and HEAD
    await exec.exec('git', ['diff', '--name-only', '--diff-filter=ACMR', `origin/${base}...HEAD`], {
      cwd,
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });

    // Filter to JS/TS files that exist
    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .filter((f) => LINTABLE_EXTENSIONS.some((ext) => f.endsWith(ext)));

    // Filter to only existing files (in case of deletions)
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      if (fs.existsSync(fullPath)) {
        changedFiles.push(file);
      }
    }
  } catch (error) {
    core.debug(`Failed to get changed files: ${error}`);
    // Fall back to linting all files
    return [];
  }

  return changedFiles;
}

/**
 * Run ESLint on specified files
 */
async function runESLint(
  cwd: string,
  files: string[],
  timeoutMs: number
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  let output = '';
  let exitCode = 0;
  let timedOut = false;

  // Build command args
  const args = ['eslint', '--format', 'json', ...files];

  const execPromise = exec.exec('npx', args, {
    cwd,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        // ESLint may write to stderr for non-error messages
        core.debug(`ESLint stderr: ${data.toString()}`);
      },
    },
  });

  // Create timeout promise
  const timeoutPromise = new Promise<number>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(-1);
    }, timeoutMs);
  });

  // Race between exec and timeout
  exitCode = await Promise.race([execPromise, timeoutPromise]);

  return { output, exitCode, timedOut };
}

/**
 * ESLint Gate implementation
 */
export const eslintGate: Gate = {
  name: 'eslint',
  displayName: 'ESLint',

  async canRun(cwd: string): Promise<boolean> {
    const check = await checkESLintAvailable(cwd);
    return check.available;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, timeoutMs, createAnnotations } = options;

    // Check if we can run
    const check = await checkESLintAvailable(cwd);
    if (!check.available) {
      return {
        gate: 'eslint',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: check.reason || 'ESLint not available',
      };
    }

    core.info(`ESLint version: ${check.version}`);

    // Get changed files
    const changedFiles = await getChangedFiles(cwd);

    if (changedFiles.length === 0) {
      return {
        gate: 'eslint',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No JS/TS files changed in PR',
      };
    }

    core.info(`Linting ${changedFiles.length} changed file(s)...`);

    try {
      // Run ESLint
      const { output, timedOut } = await runESLint(cwd, changedFiles, timeoutMs);

      if (timedOut) {
        return {
          gate: 'eslint',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `ESLint timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: output,
        };
      }

      // Parse output with severity separation
      const { errors, warnings } = parseESLintOutputWithSeverity(output, cwd);
      const allViolations = [...errors, ...warnings];
      const timeMs = Date.now() - startTime;

      // If no violations, gate passes
      if (allViolations.length === 0) {
        return {
          gate: 'eslint',
          status: 'pass',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs,
          message: 'No lint errors or warnings',
          rawOutput: output,
        };
      }

      // Create annotations
      const annotations: Annotation[] = [];
      if (createAnnotations) {
        // Errors get error severity
        for (const error of errors) {
          annotations.push(violationToAnnotation(error, 'error'));
        }
        // Warnings get warning severity
        for (const warning of warnings) {
          annotations.push(violationToAnnotation(warning, 'warning'));
        }
      }

      // Only errors block (errors count toward "new" for blocking purposes)
      // Warnings are non-blocking
      // Note: baseline and ignore filtering happens in index.ts
      return {
        gate: 'eslint',
        status: errors.length > 0 ? 'fail' : 'pass',
        totalViolations: allViolations.length,
        newViolations: allViolations.length, // Caller updates after filtering
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations: allViolations,
        timeMs,
        message:
          errors.length > 0
            ? `${errors.length} error(s), ${warnings.length} warning(s)`
            : `${warnings.length} warning(s) (non-blocking)`,
        rawOutput: output,
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        gate: 'eslint',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: `ESLint failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

export default eslintGate;
