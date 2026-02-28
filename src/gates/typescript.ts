/**
 * TypeScript Gate
 *
 * Runs `tsc --noEmit` and reports type errors.
 * Integrates with baseline (existing vs new violations) and hawkyignore.
 *
 * Error format: file(line,col): error TSxxxx: message
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * Regex to parse TypeScript error output
 * Format: file(line,col): error TSxxxx: message
 * Example: src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
 */
const TS_ERROR_REGEX = /^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Parse TypeScript compiler output into violations
 */
export function parseTypeScriptOutput(output: string, cwd: string): Violation[] {
  const violations: Violation[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(TS_ERROR_REGEX);
    if (match && match[1] && match[2] && match[3] && match[4] && match[5]) {
      const filePath = match[1];
      const lineStr = match[2];
      const colStr = match[3];
      const ruleId = match[4];
      const message = match[5];

      // Normalize file path to be relative to cwd
      let normalizedPath = filePath.trim();
      if (path.isAbsolute(normalizedPath)) {
        normalizedPath = path.relative(cwd, normalizedPath);
      }
      // Normalize path separators to forward slashes
      normalizedPath = normalizedPath.replace(/\\/g, '/');

      violations.push({
        ruleId,
        file: normalizedPath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        message: message.trim(),
        gate: 'typescript',
      });
    }
  }

  return violations;
}

/**
 * Convert a violation to a GitHub annotation
 */
export function violationToAnnotation(violation: Violation): Annotation {
  const annotation: Annotation = {
    file: violation.file,
    line: violation.line,
    message: violation.message,
    severity: 'error',
    ruleId: violation.ruleId,
    title: `TypeScript ${violation.ruleId}`,
  };
  // Only add column if defined
  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }
  return annotation;
}

/**
 * Check if TypeScript is available and tsconfig.json exists
 */
async function checkTypeScriptAvailable(cwd: string): Promise<{ available: boolean; reason?: string }> {
  // Check for tsconfig.json
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return { available: false, reason: 'No tsconfig.json found' };
  }

  // Check if tsc is available
  try {
    let tscVersion = '';
    await exec.exec('npx', ['tsc', '--version'], {
      cwd,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          tscVersion += data.toString();
        },
      },
    });
    core.debug(`TypeScript version: ${tscVersion.trim()}`);
    return { available: true };
  } catch {
    return { available: false, reason: 'TypeScript compiler (tsc) not available' };
  }
}

/**
 * Run TypeScript type checking
 */
async function runTypeScript(cwd: string, timeoutMs: number): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  let output = '';
  let exitCode = 0;
  let timedOut = false;

  const execPromise = exec.exec('npx', ['tsc', '--noEmit'], {
    cwd,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        output += data.toString();
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
 * TypeScript Gate implementation
 */
export const typescriptGate: Gate = {
  name: 'typescript',
  displayName: 'TypeScript',

  async canRun(cwd: string): Promise<boolean> {
    const check = await checkTypeScriptAvailable(cwd);
    return check.available;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, timeoutMs, createAnnotations } = options;

    // Check if we can run
    const check = await checkTypeScriptAvailable(cwd);
    if (!check.available) {
      return {
        gate: 'typescript',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: check.reason || 'TypeScript not available',
      };
    }

    try {
      // Run tsc --noEmit
      core.info('Running tsc --noEmit...');
      const { output, timedOut } = await runTypeScript(cwd, timeoutMs);

      if (timedOut) {
        return {
          gate: 'typescript',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `TypeScript check timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: output,
        };
      }

      // Parse output into violations
      const violations = parseTypeScriptOutput(output, cwd);
      const timeMs = Date.now() - startTime;

      // If no violations, gate passes
      if (violations.length === 0) {
        return {
          gate: 'typescript',
          status: 'pass',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs,
          message: 'No type errors',
          rawOutput: output,
        };
      }

      // Create annotations for all violations (filtering happens in index.ts)
      const annotations = createAnnotations
        ? violations.map(violationToAnnotation)
        : [];

      // Note: baseline and ignore filtering happens in index.ts
      // This gate returns ALL violations; caller partitions them
      return {
        gate: 'typescript',
        status: 'fail', // Caller may override based on new vs existing
        totalViolations: violations.length,
        newViolations: violations.length, // Caller updates after filtering
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations,
        timeMs,
        message: `${violations.length} type error(s) found`,
        rawOutput: output,
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        gate: 'typescript',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: `TypeScript check failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

export default typescriptGate;
