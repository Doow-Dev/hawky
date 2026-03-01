/**
 * Visual Diff Module
 *
 * Compares screenshots using lens-cli pixel diff for visual regression detection.
 * Uses anti-aliasing detection to reduce false positives from font rendering.
 *
 * S067: lens-cli Pixel Diff Integration
 */

import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

import type { DiffOptions, DiffResult } from './types';
import { DEFAULT_THRESHOLD } from './types';

/**
 * Parse diff output from lens-cli
 *
 * lens diff outputs lines like:
 * - "Diff: 0.17% (1324 pixels differ)"
 * - "PASS: Images match within threshold"
 * - "FAIL: Images differ by 2.5%"
 */
function parseDiffOutput(
  stdout: string
): { diffPercentage: number; matched: boolean } | undefined {
  // Look for percentage in output
  const percentMatch = stdout.match(/(\d+\.?\d*)\s*%/);
  if (percentMatch?.[1] !== undefined) {
    const diffPercentage = parseFloat(percentMatch[1]);
    const matched = stdout.toLowerCase().includes('pass') || diffPercentage === 0;
    return { diffPercentage, matched };
  }

  // If no percentage found but output contains PASS
  if (stdout.toLowerCase().includes('pass') || stdout.toLowerCase().includes('match')) {
    return { diffPercentage: 0, matched: true };
  }

  return undefined;
}

/**
 * Execute lens-cli command and capture output
 */
async function execLens(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  const exitCode = await exec.exec('lens', args, {
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

  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * Generate diff image output path
 */
function generateDiffPath(baselinePath: string, currentPath: string): string {
  const baselineDir = path.dirname(baselinePath);
  const baselineName = path.basename(baselinePath, '.png');
  const currentName = path.basename(currentPath, '.png');
  return path.join(baselineDir, `diff-${baselineName}-vs-${currentName}.png`);
}

/**
 * Compare two screenshots using lens-cli pixel diff
 *
 * Uses lens diff which:
 * - Compares pixels with configurable color tolerance
 * - Detects anti-aliased edges to reduce false positives
 * - Outputs diff image highlighting mismatches
 *
 * @param baselinePath - Path to baseline screenshot
 * @param currentPath - Path to current screenshot
 * @param options - Diff options including threshold
 * @returns Diff result with percentage, matched status, and diff image path
 */
export async function diffScreenshots(
  baselinePath: string,
  currentPath: string,
  options: DiffOptions = {}
): Promise<DiffResult> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  // Validate input files exist
  if (!fs.existsSync(baselinePath)) {
    return {
      success: false,
      error: `Baseline screenshot not found: ${baselinePath}`,
    };
  }

  if (!fs.existsSync(currentPath)) {
    return {
      success: false,
      error: `Current screenshot not found: ${currentPath}`,
    };
  }

  try {
    // Generate output path for diff image
    const diffImagePath = options.outputPath ?? generateDiffPath(baselinePath, currentPath);

    // Run lens diff command
    // Format: lens diff <baseline> <current> --threshold <value> --output <path>
    const args = [
      'diff',
      baselinePath,
      currentPath,
      '--threshold',
      String(threshold / 100), // lens expects 0-1 range, we use 0-100
    ];

    // Add output path if we want to save diff image
    args.push('--output', diffImagePath);

    const result = await execLens(args);

    // Parse the output
    const parsed = parseDiffOutput(result.stdout);

    if (parsed === undefined) {
      // If we couldn't parse, check exit code
      // Exit code 0 = pass, 1 = fail (images differ), other = error
      if (result.exitCode === 0) {
        return {
          success: true,
          diffPercentage: 0,
          matched: true,
        };
      } else if (result.exitCode === 1) {
        // Images differ but we couldn't parse percentage
        const diffResult: DiffResult = {
          success: true,
          diffPercentage: threshold + 1, // Assume over threshold
          matched: false,
        };
        if (fs.existsSync(diffImagePath)) {
          diffResult.diffImagePath = diffImagePath;
        }
        return diffResult;
      } else {
        return {
          success: false,
          error: `lens diff failed: ${result.stderr || result.stdout}`,
        };
      }
    }

    // Check if diff image was created
    const hasDiffImage = fs.existsSync(diffImagePath);

    const diffResult: DiffResult = {
      success: true,
      diffPercentage: parsed.diffPercentage,
      matched: parsed.diffPercentage <= threshold,
    };

    if (hasDiffImage && parsed.diffPercentage > 0) {
      diffResult.diffImagePath = diffImagePath;
    }

    return diffResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during diff',
    };
  }
}

/**
 * Compare multiple screenshot pairs in batch
 *
 * Useful for comparing all screenshots from a visual test run.
 *
 * @param pairs - Array of [baseline, current] path pairs
 * @param options - Diff options applied to all comparisons
 * @returns Array of diff results in same order as input pairs
 */
export async function diffScreenshotBatch(
  pairs: Array<[string, string]>,
  options: DiffOptions = {}
): Promise<DiffResult[]> {
  const results: DiffResult[] = [];

  for (const [baselinePath, currentPath] of pairs) {
    const result = await diffScreenshots(baselinePath, currentPath, options);
    results.push(result);
  }

  return results;
}

/**
 * Quick check if two screenshots match within threshold
 *
 * More efficient than full diff when you just need pass/fail.
 *
 * @param baselinePath - Path to baseline screenshot
 * @param currentPath - Path to current screenshot
 * @param threshold - Maximum allowed difference percentage (default: 0.1)
 * @returns Whether screenshots match within threshold
 */
export async function screenshotsMatch(
  baselinePath: string,
  currentPath: string,
  threshold: number = DEFAULT_THRESHOLD
): Promise<boolean> {
  const result = await diffScreenshots(baselinePath, currentPath, { threshold });
  return result.success && (result.matched ?? false);
}
