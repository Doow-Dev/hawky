/**
 * Semgrep Gate
 *
 * Runs Semgrep security scanning on PR-changed files.
 * - High/Error severity findings are blocking
 * - Medium/Warning severity findings are non-blocking (warnings)
 * - Low/Info severity findings are informational
 * - Integrates with baseline and hawkyignore
 *
 * Semgrep JSON format:
 * { results: [{ check_id, path, start: { line, col }, extra: { severity, message } }], errors: [] }
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * File extensions that Semgrep can scan
 * Matches Sprint 1 implementation
 */
const SCANNABLE_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rb',
  '.php',
  '.c',
  '.cpp',
  '.cs',
  '.rs',
  '.swift',
  '.kt',
  '.scala',
];

/**
 * Semgrep result item from JSON output
 */
interface SemgrepResult {
  check_id: string;
  path: string;
  start: {
    line: number;
    col: number;
  };
  end?: {
    line: number;
    col: number;
  };
  extra: {
    severity?: string;
    message?: string;
    metadata?: {
      category?: string;
      confidence?: string;
      cwe?: string[];
      owasp?: string[];
    };
  };
}

/**
 * Semgrep JSON output structure
 */
interface SemgrepOutput {
  results: SemgrepResult[];
  errors: unknown[];
  version?: string;
}

/**
 * Map Semgrep severity to our severity levels
 * ERROR/HIGH = blocking errors
 * WARNING/MEDIUM = non-blocking warnings
 * LOW/INFO = informational
 */
function mapSeverity(semgrepSeverity: string | undefined): 'error' | 'warning' {
  const sev = (semgrepSeverity || 'INFO').toUpperCase();
  if (sev === 'ERROR' || sev === 'HIGH') {
    return 'error';
  }
  // All other severities (MEDIUM, WARNING, LOW, INFO) are warnings
  return 'warning';
}

/**
 * Parse Semgrep JSON output into violations
 */
export function parseSemgrepOutput(output: string, cwd: string): Violation[] {
  const violations: Violation[] = [];

  try {
    const data: SemgrepOutput = JSON.parse(output);

    if (!data.results || !Array.isArray(data.results)) {
      core.debug('Semgrep output has no results array');
      return violations;
    }

    for (const result of data.results) {
      // Normalize file path to be relative to cwd
      let normalizedPath = result.path;
      if (path.isAbsolute(normalizedPath)) {
        normalizedPath = path.relative(cwd, normalizedPath);
      }
      // Normalize path separators to forward slashes
      normalizedPath = normalizedPath.replace(/\\/g, '/');

      const severity = mapSeverity(result.extra?.severity);
      const message = result.extra?.message || 'Security finding';

      violations.push({
        ruleId: result.check_id || 'unknown',
        file: normalizedPath,
        line: result.start?.line || 1,
        column: result.start?.col || 1,
        message: message.replace(/\n/g, ' ').trim(),
        gate: 'semgrep',
        severity,
      });
    }
  } catch (error) {
    core.debug(`Failed to parse Semgrep JSON output: ${error}`);
  }

  return violations;
}

/**
 * Parse Semgrep output and separate by severity
 */
export function parseSemgrepOutputWithSeverity(
  output: string,
  cwd: string
): { errors: Violation[]; warnings: Violation[] } {
  const violations = parseSemgrepOutput(output, cwd);
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');
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
    title: `Semgrep ${violation.ruleId}`,
  };
  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }
  return annotation;
}

/**
 * Check if Semgrep is available
 */
async function checkSemgrepAvailable(): Promise<{
  available: boolean;
  version?: string;
  reason?: string;
}> {
  try {
    let version = '';
    await exec.exec('semgrep', ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          version += data.toString();
        },
      },
    });
    if (version.trim()) {
      return { available: true, version: version.trim() };
    }
    return { available: false, reason: 'Semgrep returned empty version' };
  } catch {
    return { available: false, reason: 'Semgrep not found' };
  }
}

/**
 * Try to install Semgrep via pip
 */
async function tryInstallSemgrep(): Promise<boolean> {
  core.info('Semgrep not found, attempting to install via pip...');

  // Try pip3 first, then pip
  const pipCommands = ['pip3', 'pip'];

  for (const pip of pipCommands) {
    try {
      const exitCode = await exec.exec(pip, ['install', 'semgrep', '--quiet'], {
        silent: true,
        ignoreReturnCode: true,
      });
      if (exitCode === 0) {
        core.info(`Semgrep installed successfully via ${pip}`);
        return true;
      }
    } catch {
      core.debug(`${pip} install failed, trying next...`);
    }
  }

  core.info('Failed to install Semgrep via pip');
  return false;
}

/**
 * Get changed files from git diff
 * Returns scannable files changed between base branch and HEAD
 */
export async function getChangedFiles(
  cwd: string,
  baseBranch?: string
): Promise<string[]> {
  const changedFiles: string[] = [];

  try {
    // Use environment variables to get base branch if not provided
    const base = baseBranch || process.env['GITHUB_BASE_REF'] || 'main';
    let output = '';

    // Get changed files between base branch and HEAD
    await exec.exec(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', `origin/${base}...HEAD`],
      {
        cwd,
        silent: true,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
        },
      }
    );

    // Filter to scannable files that exist
    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .filter((f) => SCANNABLE_EXTENSIONS.some((ext) => f.endsWith(ext)));

    // Filter to only existing files (in case of deletions)
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      if (fs.existsSync(fullPath)) {
        changedFiles.push(file);
      }
    }
  } catch (error) {
    core.debug(`Failed to get changed files: ${error}`);
    return [];
  }

  return changedFiles;
}

/**
 * Run Semgrep on specified files
 */
async function runSemgrep(
  cwd: string,
  files: string[],
  rulesets: string,
  timeoutMs: number
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  let output = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;

  // Build ruleset args (space-separated rulesets)
  const rulesetArgs: string[] = [];
  for (const ruleset of rulesets.split(/\s+/).filter((r) => r.length > 0)) {
    rulesetArgs.push('--config', ruleset);
  }

  // Build include args for changed files
  const includeArgs: string[] = [];
  for (const file of files) {
    includeArgs.push('--include', file);
  }

  // Build command: semgrep scan --config <rulesets> --json --include <files> .
  const args = ['scan', ...rulesetArgs, '--json', ...includeArgs, '.'];

  core.debug(`Running: semgrep ${args.join(' ')}`);

  const execPromise = exec.exec('semgrep', args, {
    cwd,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
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

  if (stderr) {
    core.debug(`Semgrep stderr: ${stderr}`);
  }

  return { output, exitCode, timedOut };
}

/**
 * Semgrep Gate implementation
 */
export const semgrepGate: Gate = {
  name: 'semgrep',
  displayName: 'Semgrep',

  async canRun(_cwd: string): Promise<boolean> {
    // First check if already available
    let check = await checkSemgrepAvailable();
    if (check.available) {
      return true;
    }

    // Try to install
    const installed = await tryInstallSemgrep();
    if (!installed) {
      return false;
    }

    // Re-check after install
    check = await checkSemgrepAvailable();
    return check.available;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, timeoutMs, createAnnotations } = options;

    // Check if we can run (includes auto-install attempt)
    let check = await checkSemgrepAvailable();
    if (!check.available) {
      // Try to install
      const installed = await tryInstallSemgrep();
      if (installed) {
        check = await checkSemgrepAvailable();
      }
    }

    if (!check.available) {
      return {
        gate: 'semgrep',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: check.reason || 'Semgrep not available',
      };
    }

    core.info(`Semgrep version: ${check.version}`);

    // Get changed files
    const changedFiles = await getChangedFiles(cwd);

    if (changedFiles.length === 0) {
      return {
        gate: 'semgrep',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No scannable files changed in PR',
      };
    }

    core.info(`Scanning ${changedFiles.length} changed file(s)...`);

    // Get rulesets from config (passed via environment variable or default)
    const rulesets = process.env['HAWKY_GATE_SEMGREP_RULESETS'] || 'p/security-audit';
    core.info(`Rulesets: ${rulesets}`);

    try {
      // Run Semgrep
      const { output, timedOut } = await runSemgrep(
        cwd,
        changedFiles,
        rulesets,
        timeoutMs
      );

      if (timedOut) {
        return {
          gate: 'semgrep',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `Semgrep timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: output,
        };
      }

      // Check if output is valid JSON
      let parsedOutput: SemgrepOutput;
      try {
        parsedOutput = JSON.parse(output);
      } catch {
        return {
          gate: 'semgrep',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: 'Semgrep output was not valid JSON',
          error: 'Invalid JSON output',
          rawOutput: output.substring(0, 1000),
        };
      }

      // Check for Semgrep errors
      if (parsedOutput.errors && parsedOutput.errors.length > 0) {
        core.warning(`Semgrep reported ${parsedOutput.errors.length} error(s)`);
      }

      // Parse output with severity separation
      const { errors, warnings } = parseSemgrepOutputWithSeverity(output, cwd);
      const allViolations = [...errors, ...warnings];
      const timeMs = Date.now() - startTime;

      // If no violations, gate passes
      if (allViolations.length === 0) {
        return {
          gate: 'semgrep',
          status: 'pass',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs,
          message: 'No security findings',
          rawOutput: output,
        };
      }

      // Create annotations
      const annotations: Annotation[] = [];
      if (createAnnotations) {
        // Errors (HIGH/ERROR severity) get error severity
        for (const error of errors) {
          annotations.push(violationToAnnotation(error, 'error'));
        }
        // Warnings (MEDIUM/WARNING/LOW/INFO) get warning severity
        for (const warning of warnings) {
          annotations.push(violationToAnnotation(warning, 'warning'));
        }
      }

      // Only HIGH/ERROR block (errors count toward "new" for blocking purposes)
      // Other severities are non-blocking
      // Note: baseline and ignore filtering happens in index.ts
      return {
        gate: 'semgrep',
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
            ? `${errors.length} high-severity finding(s), ${warnings.length} other finding(s)`
            : `${warnings.length} finding(s) (non-blocking)`,
        rawOutput: output,
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        gate: 'semgrep',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: `Semgrep failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

export default semgrepGate;
