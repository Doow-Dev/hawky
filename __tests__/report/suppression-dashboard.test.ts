/**
 * Unit tests for S085: Suppression Review Dashboard
 *
 * Tests the suppression section generation in PR comments and step summaries.
 */

import { generatePRComment } from '../../src/report/pr-comment';
import { generateStepSummaryMarkdown } from '../../src/report/step-summary';
import type { ReportData, SuppressionEntry } from '../../src/report/types';

// Helper to create a minimal ReportData
function createReportData(
  overrides: Partial<ReportData> = {}
): ReportData {
  return {
    overallStatus: 'pass',
    gates: [],
    gatesPassed: 0,
    gatesFailed: 0,
    gatesSkipped: 0,
    totalTimeMs: 1000,
    baselineActive: false,
    baselineViolationCount: 0,
    gracePeriodActive: false,
    hawkyignoreActive: false,
    hawkyignorePatternCount: 0,
    suppressions: [],
    failFastSkippedGates: [],
    disabledGates: [],
    commitSha: 'abc1234567890',
    workflowUrl: 'https://github.com/owner/repo/actions/runs/123',
    repository: 'owner/repo',
    ...overrides,
  };
}

// Helper to create a suppression entry
function createSuppression(
  overrides: Partial<SuppressionEntry> = {}
): SuppressionEntry {
  return {
    file: 'src/example.ts',
    line: 42,
    rule: 'eslint:no-console',
    gate: 'eslint',
    reason: 'legacy/**',
    hasReason: false,
    ...overrides,
  };
}

describe('Suppression Dashboard - PR Comment', () => {
  describe('generatePRComment', () => {
    it('does not include suppression section when no suppressions', () => {
      const data = createReportData({ suppressions: [] });
      const comment = generatePRComment(data);

      expect(comment).not.toContain('Suppressions');
      expect(comment).not.toContain('suppression(s)');
    });

    it('includes suppression section with count when suppressions exist', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({ file: 'src/file1.ts', line: 10 }),
          createSuppression({ file: 'src/file2.ts', line: 20 }),
        ],
      });
      const comment = generatePRComment(data);

      expect(comment).toContain('Suppressions');
      expect(comment).toContain('This PR adds 2 new suppression(s)');
    });

    it('lists suppression details: file, line, rule', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({
            file: 'src/legacy/old-code.ts',
            line: 42,
            rule: 'eslint:no-console',
            gate: 'eslint',
          }),
        ],
      });
      const comment = generatePRComment(data);

      expect(comment).toContain('old-code.ts');
      expect(comment).toContain('42');
      expect(comment).toContain('ESLint');
      expect(comment).toContain('no-console');
    });

    it('shows warning icon for suppressions without justification', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({
            reason: 'legacy/**',
            hasReason: false,
          }),
        ],
      });
      const comment = generatePRComment(data);

      expect(comment).toContain(':warning:');
      expect(comment).toContain('no justification');
    });

    it('does not warn when suppression has proper justification', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({
            reason: 'Intentional console for debugging API responses',
            hasReason: true,
          }),
        ],
      });
      const comment = generatePRComment(data);

      expect(comment).toContain('Intentional console for debugging');
      // Should not flag as missing justification
      expect(comment).not.toContain('no justification');
    });

    it('shows warning for > 5 suppressions', () => {
      const suppressions: SuppressionEntry[] = [];
      for (let i = 0; i < 6; i++) {
        suppressions.push(createSuppression({ file: `src/file${i}.ts`, line: i + 1 }));
      }

      const data = createReportData({ suppressions });
      const comment = generatePRComment(data);

      expect(comment).toContain(':warning:');
      expect(comment).toContain('review justifications');
      expect(comment).toContain('High suppression count');
    });

    it('does not show high count warning for <= 5 suppressions', () => {
      const suppressions: SuppressionEntry[] = [];
      for (let i = 0; i < 5; i++) {
        suppressions.push(createSuppression({ file: `src/file${i}.ts`, line: i + 1 }));
      }

      const data = createReportData({ suppressions });
      const comment = generatePRComment(data);

      expect(comment).toContain('5 new suppression(s)');
      expect(comment).not.toContain('High suppression count');
    });

    it('truncates long file paths', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({
            file: 'src/very/deeply/nested/directory/structure/with/many/levels/file.ts',
          }),
        ],
      });
      const comment = generatePRComment(data);

      // Should show ellipsis for truncated paths
      expect(comment).toContain('...');
      // Should show the end of the path
      expect(comment).toContain('file.ts');
    });

    it('includes note about missing justifications', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({ hasReason: false }),
          createSuppression({ hasReason: false }),
          createSuppression({ hasReason: true, reason: 'Valid reason' }),
        ],
      });
      const comment = generatePRComment(data);

      expect(comment).toContain('2 suppression(s) lack proper justification');
    });
  });
});

describe('Suppression Dashboard - Step Summary', () => {
  describe('generateStepSummaryMarkdown', () => {
    it('does not include suppression section when no suppressions', () => {
      const data = createReportData({ suppressions: [] });
      const markdown = generateStepSummaryMarkdown(data);

      expect(markdown).not.toContain('Suppressions');
    });

    it('includes suppression section with count', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({ file: 'src/a.ts' }),
          createSuppression({ file: 'src/b.ts' }),
          createSuppression({ file: 'src/c.ts' }),
        ],
      });
      const markdown = generateStepSummaryMarkdown(data);

      expect(markdown).toContain('Suppressions');
      expect(markdown).toContain('This PR adds 3 new suppression(s)');
    });

    it('shows warning for high suppression count', () => {
      const suppressions: SuppressionEntry[] = [];
      for (let i = 0; i < 7; i++) {
        suppressions.push(createSuppression({ file: `src/file${i}.ts`, line: i + 1 }));
      }

      const data = createReportData({ suppressions });
      const markdown = generateStepSummaryMarkdown(data);

      expect(markdown).toContain('review justifications');
      expect(markdown).toContain('High suppression count');
    });

    it('includes suppression table with file, line, rule, reason columns', () => {
      const data = createReportData({
        suppressions: [
          createSuppression({
            file: 'src/utils.ts',
            line: 100,
            rule: 'semgrep:security.audit',
            gate: 'semgrep',
            reason: 'test/**',
            hasReason: false,
          }),
        ],
      });
      const markdown = generateStepSummaryMarkdown(data);

      expect(markdown).toContain('| File | Line | Rule | Reason |');
      expect(markdown).toContain('utils.ts');
      expect(markdown).toContain('100');
      expect(markdown).toContain('Semgrep');
    });
  });
});

describe('Suppression tracking', () => {
  it('tracks suppressions from different gates', () => {
    const data = createReportData({
      suppressions: [
        createSuppression({ gate: 'eslint', rule: 'eslint:no-console' }),
        createSuppression({ gate: 'typescript', rule: 'typescript:TS2322' }),
        createSuppression({ gate: 'semgrep', rule: 'semgrep:security.audit' }),
      ],
    });
    const comment = generatePRComment(data);

    expect(comment).toContain('ESLint');
    expect(comment).toContain('TypeScript');
    expect(comment).toContain('Semgrep');
  });
});
