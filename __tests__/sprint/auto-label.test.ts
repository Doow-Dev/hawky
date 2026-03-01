/**
 * Tests for Auto-Label Based on Scope (S052)
 */

import {
  fileMatchesRule,
  findTriggerFiles,
  computeAutoLabels,
  DEFAULT_LABEL_RULES,
  type LabelRule,
  type AutoLabelOptions,
  type AutoLabelResult,
} from '../../src/sprint/auto-label';

// ============================================================================
// Test helpers
// ============================================================================

function createTestRule(label: string, patterns: RegExp[]): LabelRule {
  return { name: `Test: ${label}`, patterns, label };
}

function createDefaultOptions(
  changedFiles: string[],
  overrides: Partial<AutoLabelOptions> = {}
): AutoLabelOptions {
  return { changedFiles, ...overrides };
}

// ============================================================================
// fileMatchesRule
// ============================================================================

describe('fileMatchesRule', () => {
  it('should return true when file matches a pattern', () => {
    const rule = createTestRule('test', [/^src\/auth\//]);
    expect(fileMatchesRule('src/auth/login.ts', rule)).toBe(true);
  });

  it('should return false when file does not match any pattern', () => {
    const rule = createTestRule('test', [/^src\/auth\//]);
    expect(fileMatchesRule('src/utils/helper.ts', rule)).toBe(false);
  });

  it('should return true when any of multiple patterns matches', () => {
    const rule = createTestRule('test', [/^src\/auth\//, /\.sql$/]);
    expect(fileMatchesRule('migrations/001.sql', rule)).toBe(true);
  });

  it('should match file extensions', () => {
    const rule = createTestRule('test', [/\.(css|scss)$/i]);
    expect(fileMatchesRule('src/styles/app.css', rule)).toBe(true);
    expect(fileMatchesRule('src/styles/app.scss', rule)).toBe(true);
    expect(fileMatchesRule('src/styles/app.ts', rule)).toBe(false);
  });
});

// ============================================================================
// findTriggerFiles
// ============================================================================

describe('findTriggerFiles', () => {
  it('should return only files matching the rule', () => {
    const files = [
      'src/auth/login.ts',
      'src/api/users.ts',
      'src/auth/token.ts',
    ];
    const rule = createTestRule('security', [/^src\/auth\//]);
    const triggers = findTriggerFiles(files, rule);
    expect(triggers).toHaveLength(2);
    expect(triggers).toContain('src/auth/login.ts');
    expect(triggers).toContain('src/auth/token.ts');
  });

  it('should return empty array when no files match', () => {
    const files = ['src/utils/helper.ts', 'README.md'];
    const rule = createTestRule('security', [/^src\/auth\//]);
    expect(findTriggerFiles(files, rule)).toHaveLength(0);
  });

  it('should return all files when all match', () => {
    const files = ['src/auth/a.ts', 'src/auth/b.ts'];
    const rule = createTestRule('security', [/^src\/auth\//]);
    expect(findTriggerFiles(files, rule)).toHaveLength(2);
  });
});

// ============================================================================
// computeAutoLabels — default rules
// ============================================================================

describe('computeAutoLabels — default rules', () => {
  it('should apply security-review for auth files', () => {
    const files = ['src/auth/login.ts'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('security-review');
  });

  it('should apply api-review for API route files', () => {
    const files = ['src/api/users.ts'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('api-review');
  });

  it('should apply api-review for openapi.yaml', () => {
    const files = ['openapi.yaml'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('api-review');
  });

  it('should apply database-review for migration files', () => {
    const files = ['src/migrations/001_create_users.sql'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('database-review');
  });

  it('should apply database-review for prisma schema', () => {
    const files = ['prisma/schema.prisma'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('database-review');
  });

  it('should apply ui-review for TSX components', () => {
    const files = ['src/components/Button.tsx'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('ui-review');
  });

  it('should apply ui-review for CSS files', () => {
    const files = ['src/styles/app.css'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('ui-review');
  });

  it('should apply ci-cd for GitHub Actions files', () => {
    const files = ['.github/workflows/ci.yml'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('ci-cd');
  });

  it('should apply ci-cd for action.yml', () => {
    const files = ['action.yml'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('ci-cd');
  });

  it('should apply dependencies for package.json', () => {
    const files = ['package.json'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('dependencies');
  });

  it('should apply tests label for test files', () => {
    const files = ['__tests__/auth.test.ts'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('tests');
  });

  it('should apply documentation label for markdown files', () => {
    const files = ['docs/architecture.md'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('documentation');
  });

  it('should apply multiple labels for mixed PRs', () => {
    const files = [
      'src/auth/login.ts',     // security-review
      'src/api/users.ts',      // api-review
      'src/components/Form.tsx', // ui-review
    ];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toContain('security-review');
    expect(result.labelsToApply).toContain('api-review');
    expect(result.labelsToApply).toContain('ui-review');
  });

  it('should not duplicate labels when multiple files trigger same label', () => {
    const files = [
      'src/auth/login.ts',
      'src/auth/token.ts',
      'src/auth/session.ts',
    ];
    const result = computeAutoLabels(createDefaultOptions(files));
    const securityLabels = result.labelsToApply.filter((l) => l === 'security-review');
    expect(securityLabels).toHaveLength(1);
  });
});

// ============================================================================
// computeAutoLabels — edge cases
// ============================================================================

describe('computeAutoLabels — edge cases', () => {
  it('should return empty labels for empty file list', () => {
    const result = computeAutoLabels(createDefaultOptions([]));
    expect(result.labelsToApply).toHaveLength(0);
    expect(result.message).toContain('No changed files');
  });

  it('should return empty labels for unrecognized files', () => {
    const files = ['some-random-file.xyz'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.labelsToApply).toHaveLength(0);
  });

  it('should track unmatched files', () => {
    const files = [
      'src/auth/login.ts', // matched
      'some-random-file.xyz', // unmatched
    ];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.unmatchedFiles).toContain('some-random-file.xyz');
    expect(result.unmatchedFiles).not.toContain('src/auth/login.ts');
  });

  it('should include trigger files in matchedLabels', () => {
    const files = ['src/auth/login.ts'];
    const result = computeAutoLabels(createDefaultOptions(files));
    const securityMatch = result.matchedLabels.find((m) => m.label === 'security-review');
    expect(securityMatch).toBeDefined();
    expect(securityMatch!.triggerFiles).toContain('src/auth/login.ts');
  });

  it('should support custom rules', () => {
    const customRules: LabelRule[] = [
      createTestRule('custom-label', [/^custom\//]),
    ];
    const files = ['custom/file.ts'];
    const result = computeAutoLabels(createDefaultOptions(files, { rules: customRules }));
    expect(result.labelsToApply).toContain('custom-label');
  });

  it('should include label count in message when labels applied', () => {
    const files = ['src/auth/login.ts'];
    const result = computeAutoLabels(createDefaultOptions(files));
    expect(result.message).toContain('label');
    expect(result.message).toContain('security-review');
  });
});
