/**
 * Unit tests for Visual Report Module
 *
 * Tests markdown report generation for visual regression results.
 */

import {
  formatVisualReport,
  formatVisualSummary,
  hasVisualRegressions,
} from '../../src/visual/report';
import type { VisualTestResult, Viewport } from '../../src/visual/types';

describe('formatVisualReport', () => {
  const desktopViewport: Viewport = { width: 1920, height: 1080, name: 'desktop' };
  const mobileViewport: Viewport = { width: 375, height: 667, name: 'mobile' };

  it('generates report header', () => {
    const results: VisualTestResult[] = [];
    const report = formatVisualReport(results);

    expect(report).toContain('## Visual Regression Results');
  });

  it('shows summary statistics', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/home.png',
        currentPath: '/current/home.png',
      },
      {
        route: '/about',
        viewport: desktopViewport,
        diffPercentage: 2.5,
        passed: false,
        baselinePath: '/baseline/about.png',
        currentPath: '/current/about.png',
        diffImagePath: '/diff/about.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('**2 tests**');
    expect(report).toContain('1 passed');
    expect(report).toContain('1 regressions');
  });

  it('creates collapsible sections per route', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/home.png',
        currentPath: '/current/home.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('<details>');
    expect(report).toContain('</details>');
    expect(report).toContain('<summary>');
    expect(report).toContain('/home');
  });

  it('shows pass/fail status icons', () => {
    const results: VisualTestResult[] = [
      {
        route: '/success',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/success.png',
        currentPath: '/current/success.png',
      },
      {
        route: '/failed',
        viewport: mobileViewport,
        diffPercentage: 5.0,
        passed: false,
        baselinePath: '/baseline/failed.png',
        currentPath: '/current/failed.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain(':white_check_mark:');
    expect(report).toContain(':warning:');
  });

  it('shows error icon for errored tests', () => {
    const results: VisualTestResult[] = [
      {
        route: '/error',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: false,
        baselinePath: '/baseline/error.png',
        currentPath: '/current/error.png',
        error: 'Screenshot capture failed',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain(':x:');
    expect(report).toContain('Screenshot capture failed');
  });

  it('formats diff percentage correctly', () => {
    const results: VisualTestResult[] = [
      {
        route: '/page',
        viewport: desktopViewport,
        diffPercentage: 1.234,
        passed: false,
        baselinePath: '/baseline/page.png',
        currentPath: '/current/page.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('1.23%');
  });

  it('shows 0% for identical images', () => {
    const results: VisualTestResult[] = [
      {
        route: '/identical',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/identical.png',
        currentPath: '/current/identical.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('0%');
  });

  it('includes viewport information', () => {
    const results: VisualTestResult[] = [
      {
        route: '/page',
        viewport: { width: 1920, height: 1080, name: 'desktop' },
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/page.png',
        currentPath: '/current/page.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('desktop');
    expect(report).toContain('1920x1080');
  });

  it('handles viewport without name', () => {
    const results: VisualTestResult[] = [
      {
        route: '/page',
        viewport: { width: 768, height: 1024 },
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/page.png',
        currentPath: '/current/page.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('768x1024');
  });

  it('links to diff image when available', () => {
    const results: VisualTestResult[] = [
      {
        route: '/page',
        viewport: desktopViewport,
        diffPercentage: 2.0,
        passed: false,
        baselinePath: '/baseline/page.png',
        currentPath: '/current/page.png',
        diffImagePath: '/diff/page-diff.png',
      },
    ];

    const report = formatVisualReport(results);

    expect(report).toContain('page-diff.png');
  });

  it('shows dash when no diff image', () => {
    const results: VisualTestResult[] = [
      {
        route: '/page',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/page.png',
        currentPath: '/current/page.png',
      },
    ];

    const report = formatVisualReport(results);

    // Should have a dash in the diff image column
    expect(report).toMatch(/\|\s*-\s*\|/);
  });

  it('groups multiple viewports under same route', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport: desktopViewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline/home-desktop.png',
        currentPath: '/current/home-desktop.png',
      },
      {
        route: '/home',
        viewport: mobileViewport,
        diffPercentage: 0.5,
        passed: false,
        baselinePath: '/baseline/home-mobile.png',
        currentPath: '/current/home-mobile.png',
      },
    ];

    const report = formatVisualReport(results);

    // Should have only one details section for /home
    const detailsCount = (report.match(/<details>/g) || []).length;
    expect(detailsCount).toBe(1);

    // But should show both viewports
    expect(report).toContain('desktop');
    expect(report).toContain('mobile');
  });

  it('handles empty results', () => {
    const results: VisualTestResult[] = [];
    const report = formatVisualReport(results);

    expect(report).toContain('No visual tests were run');
  });
});

describe('formatVisualSummary', () => {
  const viewport: Viewport = { width: 1920, height: 1080, name: 'desktop' };

  it('returns no tests message for empty results', () => {
    const summary = formatVisualSummary([]);

    expect(summary).toBe('No visual regression tests configured');
  });

  it('returns passed message when all tests pass', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
      {
        route: '/about',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
    ];

    const summary = formatVisualSummary(results);

    expect(summary).toContain('2 tests passed');
  });

  it('shows regression count when tests fail', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
      {
        route: '/about',
        viewport,
        diffPercentage: 5,
        passed: false,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
    ];

    const summary = formatVisualSummary(results);

    expect(summary).toContain('1 regressions');
    expect(summary).toContain('1 passed');
  });

  it('shows error count when tests error', () => {
    const results: VisualTestResult[] = [
      {
        route: '/error',
        viewport,
        diffPercentage: 0,
        passed: false,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
        error: 'Capture failed',
      },
    ];

    const summary = formatVisualSummary(results);

    expect(summary).toContain('1 errors');
  });
});

describe('hasVisualRegressions', () => {
  const viewport: Viewport = { width: 1920, height: 1080, name: 'desktop' };

  it('returns false when all tests pass', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
    ];

    expect(hasVisualRegressions(results)).toBe(false);
  });

  it('returns true when any test fails', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
      {
        route: '/about',
        viewport,
        diffPercentage: 5,
        passed: false,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
      },
    ];

    expect(hasVisualRegressions(results)).toBe(true);
  });

  it('returns true when any test has error', () => {
    const results: VisualTestResult[] = [
      {
        route: '/home',
        viewport,
        diffPercentage: 0,
        passed: true,
        baselinePath: '/baseline.png',
        currentPath: '/current.png',
        error: 'Some error',
      },
    ];

    expect(hasVisualRegressions(results)).toBe(true);
  });

  it('returns false for empty results', () => {
    expect(hasVisualRegressions([])).toBe(false);
  });
});
