/**
 * Unit tests for hawkyignore pattern matching
 *
 * Tests the matcher logic for file patterns, rule patterns,
 * and combined patterns.
 */

import { shouldIgnore, checkViolations, partitionViolations, createMatcher } from '../../src/ignore/matcher';
import type { IgnorePattern } from '../../src/ignore/types';

// Helper to create test patterns
function filePattern(pattern: string, line = 1): IgnorePattern {
  return {
    type: 'file',
    filePattern: pattern,
    rulePattern: null,
    line,
    raw: pattern,
  };
}

function rulePattern(pattern: string, line = 1): IgnorePattern {
  return {
    type: 'rule',
    filePattern: null,
    rulePattern: pattern,
    line,
    raw: pattern,
  };
}

function combinedPattern(ruleP: string, fileP: string, line = 1): IgnorePattern {
  return {
    type: 'combined',
    filePattern: fileP,
    rulePattern: ruleP,
    line,
    raw: `${ruleP}:${fileP}`,
  };
}

describe('ignore/matcher', () => {
  describe('shouldIgnore - file patterns', () => {
    it('matches exact file path', () => {
      const patterns = [filePattern('src/legacy.ts')];
      const result = shouldIgnore('src/legacy.ts', 'eslint:no-console', patterns);

      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('src/legacy.ts');
    });

    it('matches glob with single asterisk', () => {
      const patterns = [filePattern('*.generated.ts')];

      expect(shouldIgnore('component.generated.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('src/component.generated.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('component.ts', 'eslint:no-console', patterns).ignored).toBe(false);
    });

    it('matches glob with double asterisk', () => {
      const patterns = [filePattern('legacy/**')];

      expect(shouldIgnore('legacy/old.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('legacy/deep/nested/file.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('src/legacy/old.ts', 'eslint:no-console', patterns).ignored).toBe(true);
    });

    it('handles leading slash to anchor to root', () => {
      const patterns = [filePattern('/src/**')];

      expect(shouldIgnore('src/file.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('other/src/file.ts', 'eslint:no-console', patterns).ignored).toBe(false);
    });

    it('does not match when pattern does not match', () => {
      const patterns = [filePattern('legacy/**')];
      const result = shouldIgnore('src/modern.ts', 'eslint:no-console', patterns);

      expect(result.ignored).toBe(false);
      expect(result.pattern).toBeUndefined();
    });

    it('handles Windows-style paths', () => {
      const patterns = [filePattern('src/**')];
      const result = shouldIgnore('src\\components\\Button.ts', 'eslint:no-console', patterns);

      expect(result.ignored).toBe(true);
    });
  });

  describe('shouldIgnore - rule patterns', () => {
    it('matches exact rule', () => {
      const patterns = [rulePattern('eslint:no-console')];

      expect(shouldIgnore('any/file.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('other/file.ts', 'eslint:no-console', patterns).ignored).toBe(true);
    });

    it('matches rule pattern case-insensitively', () => {
      const patterns = [rulePattern('eslint:no-console')];

      expect(shouldIgnore('file.ts', 'ESLINT:NO-CONSOLE', patterns).ignored).toBe(true);
      expect(shouldIgnore('file.ts', 'EsLint:No-Console', patterns).ignored).toBe(true);
    });

    it('matches rule with wildcard', () => {
      const patterns = [rulePattern('eslint:*')];

      expect(shouldIgnore('file.ts', 'eslint:no-console', patterns).ignored).toBe(true);
      expect(shouldIgnore('file.ts', 'eslint:no-unused-vars', patterns).ignored).toBe(true);
      expect(shouldIgnore('file.ts', 'semgrep:some-rule', patterns).ignored).toBe(false);
    });

    it('does not match different rule', () => {
      const patterns = [rulePattern('eslint:no-console')];
      const result = shouldIgnore('file.ts', 'eslint:no-unused-vars', patterns);

      expect(result.ignored).toBe(false);
    });
  });

  describe('shouldIgnore - combined patterns', () => {
    it('requires both rule and file to match', () => {
      const patterns = [combinedPattern('eslint:no-console', 'test/**')];

      // Both match
      expect(shouldIgnore('test/file.ts', 'eslint:no-console', patterns).ignored).toBe(true);

      // Only file matches
      expect(shouldIgnore('test/file.ts', 'eslint:no-unused-vars', patterns).ignored).toBe(false);

      // Only rule matches
      expect(shouldIgnore('src/file.ts', 'eslint:no-console', patterns).ignored).toBe(false);

      // Neither matches
      expect(shouldIgnore('src/file.ts', 'eslint:no-unused-vars', patterns).ignored).toBe(false);
    });

    it('works with wildcards in both', () => {
      const patterns = [combinedPattern('semgrep:*', '**/*.test.ts')];

      expect(shouldIgnore('src/utils.test.ts', 'semgrep:some-rule', patterns).ignored).toBe(true);
      expect(shouldIgnore('src/utils.ts', 'semgrep:some-rule', patterns).ignored).toBe(false);
      expect(shouldIgnore('src/utils.test.ts', 'eslint:no-console', patterns).ignored).toBe(false);
    });
  });

  describe('shouldIgnore - multiple patterns', () => {
    it('matches first matching pattern', () => {
      const patterns = [
        filePattern('legacy/**'),
        rulePattern('eslint:no-console'),
        combinedPattern('semgrep:*', 'test/**'),
      ];

      const result = shouldIgnore('legacy/old.ts', 'typescript:TS2322', patterns);
      expect(result.ignored).toBe(true);
      expect(result.reason).toBe('legacy/**');
    });

    it('returns not ignored when no patterns match', () => {
      const patterns = [
        filePattern('legacy/**'),
        rulePattern('eslint:no-console'),
      ];

      const result = shouldIgnore('src/modern.ts', 'typescript:TS2322', patterns);
      expect(result.ignored).toBe(false);
    });
  });

  describe('checkViolations', () => {
    it('checks multiple violations against patterns', () => {
      const patterns = [filePattern('legacy/**')];
      const violations = [
        { filePath: 'legacy/old.ts', ruleId: 'eslint:no-console' },
        { filePath: 'src/modern.ts', ruleId: 'eslint:no-console' },
      ];

      const results = checkViolations(violations, patterns);

      expect(results).toHaveLength(2);
      expect(results[0].ignored).toBe(true);
      expect(results[1].ignored).toBe(false);
    });
  });

  describe('partitionViolations', () => {
    it('separates violations into active and ignored', () => {
      const patterns = [filePattern('legacy/**')];
      const violations = [
        { filePath: 'legacy/old.ts', ruleId: 'eslint:no-console' },
        { filePath: 'src/modern.ts', ruleId: 'eslint:no-console' },
        { filePath: 'legacy/another.ts', ruleId: 'eslint:no-unused-vars' },
      ];

      const { active, ignored } = partitionViolations(violations, patterns);

      expect(active).toHaveLength(1);
      expect(active[0].filePath).toBe('src/modern.ts');

      expect(ignored).toHaveLength(2);
      expect(ignored.map((v) => v.filePath)).toContain('legacy/old.ts');
      expect(ignored.map((v) => v.filePath)).toContain('legacy/another.ts');
    });
  });

  describe('createMatcher', () => {
    it('creates a bound matcher function', () => {
      const patterns = [rulePattern('eslint:no-console')];
      const matcher = createMatcher(patterns);

      expect(matcher('file.ts', 'eslint:no-console').ignored).toBe(true);
      expect(matcher('file.ts', 'eslint:no-unused-vars').ignored).toBe(false);
    });
  });
});
