/**
 * npm Audit Gate
 *
 * Runs `npm audit` to detect known vulnerabilities in dependencies.
 * - Critical/High severity findings are blocking by default
 * - Medium/Low severity findings are non-blocking (warnings)
 * - Configurable severity threshold via environment variable
 *
 * npm audit JSON format (v7+):
 * { vulnerabilities: { [name]: { name, severity, via, effects, ... } }, metadata: { ... } }
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * Severity levels from npm audit
 */
type NpmAuditSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/**
 * Default severity threshold - vulnerabilities at or above this level block
 */
const DEFAULT_BLOCKING_SEVERITY: NpmAuditSeverity = 'high';

/**
 * Severity ordering for comparison
 */
const SEVERITY_ORDER: Record<NpmAuditSeverity, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
  info: 0,
};

/**
 * Vulnerability info from npm audit JSON
 */
interface NpmVulnerability {
  name: string;
  severity: NpmAuditSeverity;
  isDirect: boolean;
  via: Array<string | { title: string; url: string; severity: NpmAuditSeverity }>;
  effects: string[];
  range: string;
  nodes: string[];
  fixAvailable:
    | boolean
    | {
        name: string;
        version: string;
        isSemVerMajor: boolean;
      };
}

/**
 * npm audit JSON output structure (v7+)
 */
interface NpmAuditOutput {
  auditReportVersion: number;
  vulnerabilities: Record<string, NpmVulnerability>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
    dependencies: {
      prod: number;
      dev: number;
      optional: number;
      peer: number;
      peerOptional: number;
      total: number;
    };
  };
}

/**
 * Check if severity A is at or above severity B
 */
function isAtOrAboveSeverity(a: NpmAuditSeverity, b: NpmAuditSeverity): boolean {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b];
}

/**
 * Map npm severity to our severity levels
 */
function mapSeverity(
  npmSeverity: NpmAuditSeverity,
  blockingThreshold: NpmAuditSeverity
): 'error' | 'warning' {
  return isAtOrAboveSeverity(npmSeverity, blockingThreshold) ? 'error' : 'warning';
}

/**
 * Get human-readable description for a vulnerability
 */
function getVulnerabilityMessage(vuln: NpmVulnerability): string {
  const viaInfo = vuln.via
    .map((v) => (typeof v === 'string' ? v : v.title || 'Unknown vulnerability'))
    .join(', ');

  const fixInfo = vuln.fixAvailable
    ? typeof vuln.fixAvailable === 'object'
      ? ` (fix: update to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}${vuln.fixAvailable.isSemVerMajor ? ' - BREAKING' : ''})`
      : ' (fix available)'
    : ' (no fix available)';

  return `${vuln.severity.toUpperCase()} vulnerability in ${vuln.name}: ${viaInfo}${fixInfo}`;
}

/**
 * Parse npm audit JSON output into violations
 */
export function parseNpmAuditOutput(
  output: string,
  blockingThreshold: NpmAuditSeverity
): { violations: Violation[]; errors: Violation[]; warnings: Violation[] } {
  const violations: Violation[] = [];
  const errors: Violation[] = [];
  const warnings: Violation[] = [];

  try {
    const data: NpmAuditOutput = JSON.parse(output);

    if (!data.vulnerabilities) {
      core.debug('npm audit output has no vulnerabilities object');
      return { violations, errors, warnings };
    }

    for (const [, vuln] of Object.entries(data.vulnerabilities)) {
      const severity = mapSeverity(vuln.severity, blockingThreshold);
      const message = getVulnerabilityMessage(vuln);

      const violation: Violation = {
        ruleId: `npm-audit-${vuln.severity}`,
        file: 'package.json',
        line: 1,
        column: 1,
        message,
        gate: 'npm-audit',
        severity,
      };

      violations.push(violation);

      if (severity === 'error') {
        errors.push(violation);
      } else {
        warnings.push(violation);
      }
    }
  } catch (error) {
    core.debug(`Failed to parse npm audit JSON output: ${error}`);
  }

  return { violations, errors, warnings };
}

/**
 * Convert a violation to a GitHub annotation
 */
export function violationToAnnotation(
  violation: Violation,
  severity: 'error' | 'warning'
): Annotation {
  return {
    file: violation.file,
    line: violation.line,
    message: violation.message,
    severity,
    ruleId: violation.ruleId,
    title: `npm audit: ${violation.ruleId.replace('npm-audit-', '')}`,
  };
}

/**
 * Check if npm is available
 */
async function checkNpmAvailable(): Promise<{
  available: boolean;
  version?: string;
  reason?: string;
}> {
  try {
    let version = '';
    const exitCode = await exec.exec('npm', ['--version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          version += data.toString();
        },
      },
    });
    if (exitCode === 0 && version.trim()) {
      return { available: true, version: version.trim() };
    }
    return { available: false, reason: 'npm returned empty version' };
  } catch {
    return { available: false, reason: 'npm not found' };
  }
}

/**
 * Check if package.json exists
 */
function hasPackageJson(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package.json'));
}

/**
 * Check if package-lock.json exists
 */
function hasPackageLock(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package-lock.json'));
}

/**
 * Run npm audit
 */
async function runNpmAudit(
  cwd: string,
  timeoutMs: number
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  let output = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;

  // Build command: npm audit --json
  // Note: npm audit exit code is:
  // 0 = no vulnerabilities
  // 1 = vulnerabilities found
  // We need to ignore the return code to capture the JSON output
  const args = ['audit', '--json'];

  core.debug(`Running: npm ${args.join(' ')}`);

  const execPromise = exec.exec('npm', args, {
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
    core.debug(`npm audit stderr: ${stderr}`);
  }

  return { output, exitCode, timedOut };
}

/**
 * npm Audit Gate implementation
 */
export const npmAuditGate: Gate = {
  name: 'npm-audit',
  displayName: 'npm Audit',

  async canRun(cwd: string): Promise<boolean> {
    // Check if npm is available
    const npmCheck = await checkNpmAvailable();
    if (!npmCheck.available) {
      core.debug(`npm not available: ${npmCheck.reason}`);
      return false;
    }

    // Check if package.json exists
    if (!hasPackageJson(cwd)) {
      core.debug('package.json not found');
      return false;
    }

    return true;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, timeoutMs, createAnnotations } = options;

    // Check if we can run
    const npmCheck = await checkNpmAvailable();
    if (!npmCheck.available) {
      return {
        gate: 'npm-audit',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: npmCheck.reason || 'npm not available',
      };
    }

    if (!hasPackageJson(cwd)) {
      return {
        gate: 'npm-audit',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'No package.json found',
      };
    }

    // Warn if no package-lock.json (audit may be less accurate)
    if (!hasPackageLock(cwd)) {
      core.warning(
        'No package-lock.json found. npm audit may report incorrect results.'
      );
    }

    core.info(`npm version: ${npmCheck.version}`);

    // Get severity threshold from environment or use default
    const thresholdEnv = process.env['HAWKY_GATE_NPM_AUDIT_THRESHOLD'] as
      | NpmAuditSeverity
      | undefined;
    const blockingThreshold: NpmAuditSeverity =
      thresholdEnv && ['critical', 'high', 'moderate', 'low', 'info'].includes(thresholdEnv)
        ? thresholdEnv
        : DEFAULT_BLOCKING_SEVERITY;

    core.info(`Blocking severity threshold: ${blockingThreshold}`);

    try {
      // Run npm audit
      const { output, timedOut } = await runNpmAudit(cwd, timeoutMs);

      if (timedOut) {
        return {
          gate: 'npm-audit',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `npm audit timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: output,
        };
      }

      // Check if output is valid JSON
      try {
        JSON.parse(output);
      } catch {
        return {
          gate: 'npm-audit',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: 'npm audit output was not valid JSON',
          error: 'Invalid JSON output',
          rawOutput: output.substring(0, 1000),
        };
      }

      // Parse output
      const { violations, errors, warnings } = parseNpmAuditOutput(output, blockingThreshold);
      const timeMs = Date.now() - startTime;

      // If no violations, gate passes
      if (violations.length === 0) {
        return {
          gate: 'npm-audit',
          status: 'pass',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs,
          message: 'No vulnerabilities found',
          rawOutput: output,
        };
      }

      // Create annotations
      const annotations: Annotation[] = [];
      if (createAnnotations) {
        for (const error of errors) {
          annotations.push(violationToAnnotation(error, 'error'));
        }
        for (const warning of warnings) {
          annotations.push(violationToAnnotation(warning, 'warning'));
        }
      }

      // Determine status based on blocking violations
      const status = errors.length > 0 ? 'fail' : 'pass';

      return {
        gate: 'npm-audit',
        status,
        totalViolations: violations.length,
        newViolations: violations.length, // Caller updates after filtering
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations,
        timeMs,
        message:
          errors.length > 0
            ? `${errors.length} blocking vulnerability(ies), ${warnings.length} other(s)`
            : `${warnings.length} non-blocking vulnerability(ies)`,
        rawOutput: output,
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        gate: 'npm-audit',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: `npm audit failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

export default npmAuditGate;
