/**
 * Gitleaks Gate
 *
 * Scans PR-changed files for hardcoded secrets using Gitleaks.
 * IMPORTANT: ALL secret findings are blocking (severity: 'error') — secrets should never pass.
 * Unlike other gates, even baselined secrets should trigger a warning.
 *
 * Gitleaks JSON format:
 * [{ RuleID, File, StartLine, StartColumn, Secret, Match, Description, ... }]
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';

/**
 * Gitleaks finding from JSON output
 */
interface GitleaksFinding {
  RuleID: string;
  File: string;
  StartLine: number;
  StartColumn: number;
  EndLine?: number;
  EndColumn?: number;
  Secret?: string;
  Match?: string;
  Description?: string;
  Entropy?: number;
  Date?: string;
  Author?: string;
  Email?: string;
  Commit?: string;
  Message?: string;
  Tags?: string[];
}

/**
 * Extensions that commonly contain code/config where secrets might be embedded
 * More permissive than Semgrep since secrets can appear in many file types
 */
const SCANNABLE_EXTENSIONS = [
  // Code
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php',
  '.c', '.cpp', '.cs', '.rs', '.swift', '.kt', '.scala',
  // Config
  '.json', '.yml', '.yaml', '.toml', '.xml', '.ini', '.env',
  '.properties', '.config', '.cfg',
  // Scripts
  '.sh', '.bash', '.ps1', '.bat', '.cmd',
  // Other
  '.tf', '.tfvars', '.sql', '.graphql', '.md', '.txt',
];

/**
 * Test/mock file patterns to filter by default
 * These often contain fake secrets for testing
 */
const TEST_FILE_PATTERNS = [
  /[/\\]test[/\\]/i,
  /[/\\]tests[/\\]/i,
  /[/\\]__tests__[/\\]/i,
  /[/\\]__mocks__[/\\]/i,
  /[/\\]fixtures[/\\]/i,
  /[/\\]testdata[/\\]/i,
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /\.mock\.[jt]sx?$/i,
  /[/\\]examples?[/\\]/i,
  /[/\\]samples?[/\\]/i,
];

/**
 * Check if a file is a test/mock file
 */
function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Parse Gitleaks JSON output into violations
 * All findings are blocking (severity: 'error')
 */
export function parseGitleaksOutput(output: string, cwd: string): Violation[] {
  const violations: Violation[] = [];

  try {
    // Gitleaks outputs an array of findings
    const data: GitleaksFinding[] = JSON.parse(output);

    if (!Array.isArray(data)) {
      core.debug('Gitleaks output is not an array');
      return violations;
    }

    for (const finding of data) {
      // Normalize file path to be relative to cwd
      let normalizedPath = finding.File;
      if (path.isAbsolute(normalizedPath)) {
        normalizedPath = path.relative(cwd, normalizedPath);
      }
      // Normalize path separators to forward slashes
      normalizedPath = normalizedPath.replace(/\\/g, '/');

      // Build message (redact the actual secret)
      const message = finding.Description || `Potential secret detected (${finding.RuleID})`;

      violations.push({
        ruleId: finding.RuleID || 'unknown',
        file: normalizedPath,
        line: finding.StartLine || 1,
        column: finding.StartColumn || 1,
        message: message.replace(/\n/g, ' ').trim(),
        gate: 'gitleaks',
        // CRITICAL: All secrets are blocking errors — never let secrets pass
        severity: 'error',
      });
    }
  } catch (error) {
    core.debug(`Failed to parse Gitleaks JSON output: ${error}`);
  }

  return violations;
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
    title: `Gitleaks ${violation.ruleId}`,
  };
  if (violation.column !== undefined) {
    annotation.column = violation.column;
  }
  return annotation;
}

/**
 * Check if Gitleaks is available
 */
async function checkGitleaksAvailable(): Promise<{
  available: boolean;
  version?: string;
  reason?: string;
}> {
  try {
    let version = '';
    const exitCode = await exec.exec('gitleaks', ['version'], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          version += data.toString();
        },
        stderr: (data: Buffer) => {
          // Gitleaks might output version to stderr
          version += data.toString();
        },
      },
    });
    if (exitCode === 0 && version.trim()) {
      return { available: true, version: version.trim() };
    }
    return { available: false, reason: 'Gitleaks returned empty version' };
  } catch {
    return { available: false, reason: 'Gitleaks not found' };
  }
}

/**
 * Try to install Gitleaks binary
 * Downloads from GitHub releases
 */
async function tryInstallGitleaks(): Promise<boolean> {
  core.info('Gitleaks not found, attempting to install...');

  const GITLEAKS_VERSION = '8.18.4';
  const platform = os.platform();
  const arch = os.arch();

  // Determine download URL based on platform
  let assetName: string;
  let extractCommand: string;
  let extractArgs: string[];

  if (platform === 'linux') {
    const archName = arch === 'arm64' ? 'arm64' : 'x64';
    assetName = `gitleaks_${GITLEAKS_VERSION}_linux_${archName}.tar.gz`;
    extractCommand = 'tar';
    extractArgs = ['-xzf'];
  } else if (platform === 'darwin') {
    const archName = arch === 'arm64' ? 'arm64' : 'x64';
    assetName = `gitleaks_${GITLEAKS_VERSION}_darwin_${archName}.tar.gz`;
    extractCommand = 'tar';
    extractArgs = ['-xzf'];
  } else if (platform === 'win32') {
    const archName = arch === 'arm64' ? 'arm64' : 'x64';
    assetName = `gitleaks_${GITLEAKS_VERSION}_windows_${archName}.zip`;
    extractCommand = 'unzip';
    extractArgs = ['-o'];
  } else {
    core.info(`Unsupported platform: ${platform}`);
    return false;
  }

  const downloadUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${assetName}`;
  const tmpDir = os.tmpdir();
  const archivePath = path.join(tmpDir, assetName);

  try {
    // Download archive
    core.debug(`Downloading Gitleaks from: ${downloadUrl}`);
    const curlExitCode = await exec.exec(
      'curl',
      ['-sSfL', '-o', archivePath, downloadUrl],
      {
        silent: true,
        ignoreReturnCode: true,
      }
    );

    if (curlExitCode !== 0) {
      core.debug('curl failed, trying wget...');
      const wgetExitCode = await exec.exec(
        'wget',
        ['-q', '-O', archivePath, downloadUrl],
        {
          silent: true,
          ignoreReturnCode: true,
        }
      );
      if (wgetExitCode !== 0) {
        core.info('Failed to download Gitleaks (curl and wget both failed)');
        return false;
      }
    }

    // Extract archive
    core.debug(`Extracting Gitleaks to: ${tmpDir}`);
    const extractExitCode = await exec.exec(
      extractCommand,
      [...extractArgs, archivePath, '-C', tmpDir],
      {
        silent: true,
        ignoreReturnCode: true,
        cwd: tmpDir,
      }
    );

    if (extractExitCode !== 0) {
      // Try PowerShell for Windows zip
      if (platform === 'win32') {
        const psExitCode = await exec.exec(
          'powershell',
          ['-Command', `Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpDir}' -Force`],
          {
            silent: true,
            ignoreReturnCode: true,
          }
        );
        if (psExitCode !== 0) {
          core.info('Failed to extract Gitleaks archive');
          return false;
        }
      } else {
        core.info('Failed to extract Gitleaks archive');
        return false;
      }
    }

    // Move binary to PATH
    const binaryName = platform === 'win32' ? 'gitleaks.exe' : 'gitleaks';
    const binaryPath = path.join(tmpDir, binaryName);

    if (!fs.existsSync(binaryPath)) {
      core.info(`Gitleaks binary not found at: ${binaryPath}`);
      return false;
    }

    // Make executable (Unix only)
    if (platform !== 'win32') {
      await exec.exec('chmod', ['+x', binaryPath], {
        silent: true,
        ignoreReturnCode: true,
      });
    }

    // Try to move to /usr/local/bin (Linux/macOS) or add to PATH
    if (platform !== 'win32') {
      const installExitCode = await exec.exec(
        'sudo',
        ['mv', binaryPath, '/usr/local/bin/gitleaks'],
        {
          silent: true,
          ignoreReturnCode: true,
        }
      );

      if (installExitCode !== 0) {
        // Try without sudo (GitHub Actions runners usually allow this)
        const mvExitCode = await exec.exec(
          'mv',
          [binaryPath, '/usr/local/bin/gitleaks'],
          {
            silent: true,
            ignoreReturnCode: true,
          }
        );

        if (mvExitCode !== 0) {
          // Fall back to ~/.local/bin
          const localBin = path.join(os.homedir(), '.local', 'bin');
          if (!fs.existsSync(localBin)) {
            fs.mkdirSync(localBin, { recursive: true });
          }
          await exec.exec('mv', [binaryPath, path.join(localBin, 'gitleaks')], {
            silent: true,
            ignoreReturnCode: true,
          });
          // Add to PATH for this session
          process.env['PATH'] = `${localBin}${path.delimiter}${process.env['PATH']}`;
        }
      }
    } else {
      // Windows: keep binary in temp and add to PATH
      process.env['PATH'] = `${tmpDir}${path.delimiter}${process.env['PATH']}`;
    }

    core.info('Gitleaks installed successfully');
    return true;
  } catch (error) {
    core.debug(`Gitleaks installation failed: ${error}`);
    return false;
  }
}

/**
 * Get changed files from git diff
 * Returns all files changed between base branch and HEAD
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
 * Run Gitleaks on specified files
 */
async function runGitleaks(
  cwd: string,
  files: string[],
  timeoutMs: number,
  filterTestFiles: boolean
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
  let output = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;

  // Create a temporary directory with only the files we want to scan
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-'));

  try {
    // Filter out test files if enabled
    const filesToScan = filterTestFiles
      ? files.filter((f) => !isTestFile(f))
      : files;

    if (filesToScan.length === 0) {
      return { output: '[]', exitCode: 0, timedOut: false };
    }

    // Copy files to temp directory (preserving structure)
    for (const file of filesToScan) {
      const srcPath = path.join(cwd, file);
      const destPath = path.join(tmpDir, file);
      const destDir = path.dirname(destPath);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(srcPath, destPath);
    }

    // Copy .gitleaksignore if it exists
    const gitleaksIgnorePath = path.join(cwd, '.gitleaksignore');
    if (fs.existsSync(gitleaksIgnorePath)) {
      fs.copyFileSync(gitleaksIgnorePath, path.join(tmpDir, '.gitleaksignore'));
    }

    // Build command: gitleaks detect --source <tmpDir> --report-format json --report-path <report> --no-git
    const reportPath = path.join(tmpDir, 'gitleaks-report.json');
    const args = [
      'detect',
      '--source',
      tmpDir,
      '--report-format',
      'json',
      '--report-path',
      reportPath,
      '--no-git',
    ];

    core.debug(`Running: gitleaks ${args.join(' ')}`);

    const execPromise = exec.exec('gitleaks', args, {
      cwd: tmpDir,
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          // Gitleaks outputs summary to stdout
          core.debug(`Gitleaks stdout: ${data.toString()}`);
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
      core.debug(`Gitleaks stderr: ${stderr}`);
    }

    // Read report if it exists
    if (fs.existsSync(reportPath)) {
      output = fs.readFileSync(reportPath, 'utf8');
    } else {
      // No report means no findings (or error)
      output = '[]';
    }

    // Gitleaks exit codes:
    // 0 = no leaks found
    // 1 = leaks found
    // Other = error

    return { output, exitCode, timedOut };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Gitleaks Gate implementation
 */
export const gitleaksGate: Gate = {
  name: 'gitleaks',
  displayName: 'Gitleaks',

  async canRun(_cwd: string): Promise<boolean> {
    // First check if already available
    let check = await checkGitleaksAvailable();
    if (check.available) {
      return true;
    }

    // Try to install
    const installed = await tryInstallGitleaks();
    if (!installed) {
      return false;
    }

    // Re-check after install
    check = await checkGitleaksAvailable();
    return check.available;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const { cwd, timeoutMs, createAnnotations } = options;

    // Check if we can run (includes auto-install attempt)
    let check = await checkGitleaksAvailable();
    if (!check.available) {
      // Try to install
      const installed = await tryInstallGitleaks();
      if (installed) {
        check = await checkGitleaksAvailable();
      }
    }

    if (!check.available) {
      return {
        gate: 'gitleaks',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: check.reason || 'Gitleaks not available',
      };
    }

    core.info(`Gitleaks version: ${check.version}`);

    // Get changed files
    const changedFiles = await getChangedFiles(cwd);

    if (changedFiles.length === 0) {
      return {
        gate: 'gitleaks',
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

    // Filter test files by default (configurable via environment)
    const filterTestFiles = process.env['HAWKY_GATE_GITLEAKS_SCAN_TESTS'] !== 'true';

    try {
      // Run Gitleaks
      const { output, exitCode, timedOut } = await runGitleaks(
        cwd,
        changedFiles,
        timeoutMs,
        filterTestFiles
      );

      if (timedOut) {
        return {
          gate: 'gitleaks',
          status: 'error',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: `Gitleaks timed out after ${timeoutMs}ms`,
          error: 'Timeout',
          rawOutput: output,
        };
      }

      // Check if output is valid JSON
      let findings: GitleaksFinding[];
      try {
        findings = JSON.parse(output);
        if (!Array.isArray(findings)) {
          findings = [];
        }
      } catch {
        // If gitleaks exit code is 0, no findings is normal
        if (exitCode === 0) {
          findings = [];
        } else {
          return {
            gate: 'gitleaks',
            status: 'error',
            totalViolations: 0,
            newViolations: 0,
            existingViolations: 0,
            ignoredViolations: 0,
            annotations: [],
            violations: [],
            timeMs: Date.now() - startTime,
            message: 'Gitleaks output was not valid JSON',
            error: 'Invalid JSON output',
            rawOutput: output.substring(0, 1000),
          };
        }
      }

      // Parse output
      const violations = parseGitleaksOutput(output, cwd);
      const timeMs = Date.now() - startTime;

      // If no violations, gate passes
      if (violations.length === 0) {
        return {
          gate: 'gitleaks',
          status: 'pass',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs,
          message: 'No secrets detected',
          rawOutput: output,
        };
      }

      // Create annotations (all secrets are errors)
      const annotations: Annotation[] = [];
      if (createAnnotations) {
        for (const violation of violations) {
          annotations.push(violationToAnnotation(violation, 'error'));
        }
      }

      // All secrets are blocking — they should NEVER pass
      return {
        gate: 'gitleaks',
        status: 'fail',
        totalViolations: violations.length,
        newViolations: violations.length, // Caller updates after filtering
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations,
        timeMs,
        message: `${violations.length} secret(s) detected — BLOCKING`,
        rawOutput: output,
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        gate: 'gitleaks',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs,
        message: `Gitleaks failed: ${errorMessage}`,
        error: errorMessage,
      };
    }
  },
};

export default gitleaksGate;
