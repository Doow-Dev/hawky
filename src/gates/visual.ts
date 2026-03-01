/**
 * Visual Gate
 *
 * Performs visual regression testing by comparing screenshots
 * of the PR branch against the base branch.
 *
 * S071: Visual Gate
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

import type { Gate, GateResult, GateRunOptions, Violation, Annotation } from './types';
import type { VisualConfig, ViewportConfig } from '../config/types';
import type { VisualTestResult, Viewport } from '../visual/types';
import { captureScreenshot, stopHeadlessBrowser } from '../visual/screenshot';
import { diffScreenshots } from '../visual/diff';
import { DEFAULT_THRESHOLD, DEFAULT_TIMEOUT } from '../visual/types';

/**
 * Default viewport if none configured
 */
const DEFAULT_VIEWPORT: Viewport = {
  width: 1920,
  height: 1080,
  name: 'desktop',
};

/**
 * Convert ViewportConfig to Viewport type
 */
function toViewport(config: ViewportConfig): Viewport {
  const viewport: Viewport = {
    width: config.width,
    height: config.height,
  };
  if (config.name !== undefined) {
    viewport.name = config.name;
  }
  return viewport;
}

/**
 * Generate screenshot filename for a route and viewport
 */
function generateScreenshotName(
  route: string,
  viewport: Viewport,
  branch: 'baseline' | 'current'
): string {
  // Sanitize route for filename
  const sanitizedRoute = route
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);

  const viewportName = viewport.name ?? `${viewport.width}x${viewport.height}`;
  return `${branch}-${sanitizedRoute}-${viewportName}.png`;
}

/**
 * Convert visual test result to violation
 */
function resultToViolation(result: VisualTestResult): Violation {
  const viewportName = result.viewport.name ?? `${result.viewport.width}x${result.viewport.height}`;

  return {
    ruleId: 'visual/regression',
    file: result.route,
    line: 1,
    message: result.error
      ? `Visual test error: ${result.error}`
      : `Visual regression detected: ${result.diffPercentage.toFixed(2)}% difference at ${viewportName}`,
    gate: 'visual',
    severity: 'warning',
  };
}

/**
 * Convert visual test result to annotation
 */
export function resultToAnnotation(result: VisualTestResult): Annotation {
  const viewportName = result.viewport.name ?? `${result.viewport.width}x${result.viewport.height}`;

  return {
    file: result.route,
    line: 1,
    message: result.error
      ? `Visual test error: ${result.error}`
      : `Visual regression: ${result.diffPercentage.toFixed(2)}% difference (threshold: exceeded) at ${viewportName}`,
    severity: result.error ? 'error' : 'warning',
    ruleId: 'visual/regression',
    title: `Visual Regression at ${viewportName}`,
  };
}

/**
 * Run visual tests for all configured routes and viewports
 */
async function runVisualTests(
  config: VisualConfig,
  baselineDir: string,
  currentDir: string
): Promise<VisualTestResult[]> {
  const results: VisualTestResult[] = [];

  const routes = config.routes ?? [];
  const viewports = (config.viewports ?? [DEFAULT_VIEWPORT]).map((v) =>
    typeof v === 'object' && 'width' in v ? toViewport(v) : DEFAULT_VIEWPORT
  );
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const waitFor = config.waitFor;

  if (routes.length === 0) {
    core.info('No routes configured for visual testing');
    return results;
  }

  core.info(`Running visual tests: ${routes.length} routes x ${viewports.length} viewports`);

  for (const route of routes) {
    for (const viewport of viewports) {
      const viewportName = viewport.name ?? `${viewport.width}x${viewport.height}`;
      core.info(`Testing ${route} at ${viewportName}...`);

      const baselineName = generateScreenshotName(route, viewport, 'baseline');
      const currentName = generateScreenshotName(route, viewport, 'current');

      const baselinePath = path.join(baselineDir, baselineName);
      const currentPath = path.join(currentDir, currentName);

      // Check if baseline exists (from base branch)
      if (!fs.existsSync(baselinePath)) {
        // No baseline = capture current and skip comparison
        core.info(`No baseline found for ${route} at ${viewportName}, capturing initial screenshot`);

        const captureOpts: import('../visual/types').ScreenshotOptions = {
          viewport,
          timeout,
          outputDir: currentDir,
          filename: currentName,
        };
        if (waitFor !== undefined) {
          captureOpts.waitFor = waitFor;
        }
        const captureResult = await captureScreenshot(route, captureOpts);

        if (!captureResult.success) {
          const errResult: VisualTestResult = {
            route,
            viewport,
            diffPercentage: 0,
            passed: true, // No baseline means pass
            baselinePath,
            currentPath,
            error: `No baseline (first run): ${captureResult.error ?? 'captured new baseline'}`,
          };
          results.push(errResult);
        } else {
          results.push({
            route,
            viewport,
            diffPercentage: 0,
            passed: true,
            baselinePath,
            currentPath: captureResult.path ?? currentPath,
          });
        }

        continue;
      }

      // Capture current screenshot
      const currentCaptureOpts: import('../visual/types').ScreenshotOptions = {
        viewport,
        timeout,
        outputDir: currentDir,
        filename: currentName,
      };
      if (waitFor !== undefined) {
        currentCaptureOpts.waitFor = waitFor;
      }
      const captureResult = await captureScreenshot(route, currentCaptureOpts);

      if (!captureResult.success) {
        const failResult: VisualTestResult = {
          route,
          viewport,
          diffPercentage: 100,
          passed: false,
          baselinePath,
          currentPath,
        };
        if (captureResult.error !== undefined) {
          failResult.error = captureResult.error;
        }
        results.push(failResult);
        continue;
      }

      // Compare screenshots
      const diffResult = await diffScreenshots(baselinePath, captureResult.path ?? currentPath, {
        threshold,
      });

      if (!diffResult.success) {
        const diffFailResult: VisualTestResult = {
          route,
          viewport,
          diffPercentage: 100,
          passed: false,
          baselinePath,
          currentPath: captureResult.path ?? currentPath,
        };
        if (diffResult.error !== undefined) {
          diffFailResult.error = diffResult.error;
        }
        results.push(diffFailResult);
        continue;
      }

      const passed = diffResult.matched ?? (diffResult.diffPercentage ?? 0) <= threshold;

      const testResult: VisualTestResult = {
        route,
        viewport,
        diffPercentage: diffResult.diffPercentage ?? 0,
        passed,
        baselinePath,
        currentPath: captureResult.path ?? currentPath,
      };
      if (diffResult.diffImagePath !== undefined) {
        testResult.diffImagePath = diffResult.diffImagePath;
      }
      results.push(testResult);

      if (!passed) {
        core.warning(
          `Visual regression at ${route} (${viewportName}): ${diffResult.diffPercentage?.toFixed(2)}% difference`
        );
      }
    }
  }

  return results;
}

/**
 * Visual regression gate implementation
 */
export const visualGate: Gate = {
  name: 'visual',
  displayName: 'Visual Regression',

  async canRun(_cwd: string): Promise<boolean> {
    // Check if visual config exists with routes
    // This would normally load config, but for now just return true
    // The actual config check happens in run()
    return true;
  },

  async run(options: GateRunOptions): Promise<GateResult> {
    const startTime = Date.now();
    const violations: Violation[] = [];
    const annotations: Annotation[] = [];

    try {
      // Load visual config from environment or config
      // In actual implementation, this would come from parsed config
      const visualConfig: VisualConfig = {
        enabled: process.env['HAWKY_VISUAL_ENABLED'] === 'true',
        threshold: parseFloat(process.env['HAWKY_VISUAL_THRESHOLD'] ?? '0.1'),
        routes: (process.env['HAWKY_VISUAL_ROUTES'] ?? '').split(',').filter(Boolean),
        timeout: parseInt(process.env['HAWKY_VISUAL_TIMEOUT'] ?? '30000', 10),
        viewports: [DEFAULT_VIEWPORT],
      };
      const envWaitFor = process.env['HAWKY_VISUAL_WAIT_FOR'];
      if (envWaitFor !== undefined) {
        visualConfig.waitFor = envWaitFor;
      }

      // Skip if not enabled or no routes
      if (!visualConfig.enabled || !visualConfig.routes || visualConfig.routes.length === 0) {
        return {
          gate: 'visual',
          status: 'skip',
          totalViolations: 0,
          newViolations: 0,
          existingViolations: 0,
          ignoredViolations: 0,
          annotations: [],
          violations: [],
          timeMs: Date.now() - startTime,
          message: 'Visual testing skipped: not enabled or no routes configured',
        };
      }

      // Set up directories
      const baselineDir = process.env['HAWKY_VISUAL_BASELINE_DIR'] ?? '/tmp/hawky-visual/baseline';
      const currentDir = process.env['HAWKY_VISUAL_CURRENT_DIR'] ?? '/tmp/hawky-visual/current';

      // Ensure directories exist
      if (!fs.existsSync(baselineDir)) {
        fs.mkdirSync(baselineDir, { recursive: true });
      }
      if (!fs.existsSync(currentDir)) {
        fs.mkdirSync(currentDir, { recursive: true });
      }

      // Run visual tests
      const results = await runVisualTests(visualConfig, baselineDir, currentDir);

      // Clean up headless browser
      await stopHeadlessBrowser();

      // Convert failed results to violations
      const failedResults = results.filter((r) => !r.passed);
      for (const result of failedResults) {
        violations.push(resultToViolation(result));
        if (options.createAnnotations) {
          annotations.push(resultToAnnotation(result));
        }
      }

      const passedCount = results.filter((r) => r.passed).length;
      const status = violations.length > 0 ? 'fail' : 'pass';

      return {
        gate: 'visual',
        status,
        totalViolations: violations.length,
        newViolations: violations.length, // All visual violations are "new"
        existingViolations: 0,
        ignoredViolations: 0,
        annotations,
        violations,
        timeMs: Date.now() - startTime,
        message:
          violations.length > 0
            ? `Visual regressions detected: ${violations.length} failed, ${passedCount} passed`
            : `Visual tests passed: ${passedCount} tests`,
      };
    } catch (error) {
      // Ensure browser is stopped even on error
      try {
        await stopHeadlessBrowser();
      } catch {
        // Ignore cleanup errors
      }

      return {
        gate: 'visual',
        status: 'error',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'Visual gate error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Run visual gate with explicit config
 *
 * Alternative entry point for use with parsed config
 */
export async function runVisualGate(
  config: VisualConfig,
  baselineDir: string,
  currentDir: string,
  options: GateRunOptions
): Promise<GateResult> {
  const startTime = Date.now();
  const violations: Violation[] = [];
  const annotations: Annotation[] = [];

  try {
    if (!config.enabled || !config.routes || config.routes.length === 0) {
      return {
        gate: 'visual',
        status: 'skip',
        totalViolations: 0,
        newViolations: 0,
        existingViolations: 0,
        ignoredViolations: 0,
        annotations: [],
        violations: [],
        timeMs: Date.now() - startTime,
        message: 'Visual testing skipped: not enabled or no routes configured',
      };
    }

    // Ensure directories exist
    if (!fs.existsSync(baselineDir)) {
      fs.mkdirSync(baselineDir, { recursive: true });
    }
    if (!fs.existsSync(currentDir)) {
      fs.mkdirSync(currentDir, { recursive: true });
    }

    const results = await runVisualTests(config, baselineDir, currentDir);

    // Clean up
    await stopHeadlessBrowser();

    // Convert failed results to violations
    const failedResults = results.filter((r) => !r.passed);
    for (const result of failedResults) {
      violations.push(resultToViolation(result));
      if (options.createAnnotations) {
        annotations.push(resultToAnnotation(result));
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const status = violations.length > 0 ? 'fail' : 'pass';

    return {
      gate: 'visual',
      status,
      totalViolations: violations.length,
      newViolations: violations.length,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations,
      violations,
      timeMs: Date.now() - startTime,
      message:
        violations.length > 0
          ? `Visual regressions detected: ${violations.length} failed, ${passedCount} passed`
          : `Visual tests passed: ${passedCount} tests`,
    };
  } catch (error) {
    try {
      await stopHeadlessBrowser();
    } catch {
      // Ignore cleanup errors
    }

    return {
      gate: 'visual',
      status: 'error',
      totalViolations: 0,
      newViolations: 0,
      existingViolations: 0,
      ignoredViolations: 0,
      annotations: [],
      violations: [],
      timeMs: Date.now() - startTime,
      message: 'Visual gate error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
