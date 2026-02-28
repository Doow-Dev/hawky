/**
 * Unit tests for hawkyignore parser
 *
 * Tests parsing of .hawkyignore file content into structured patterns.
 */

import { parseIgnoreContent, getPatternSummary } from '../../src/ignore/parser';

describe('ignore/parser', () => {
  describe('parseIgnoreContent', () => {
    it('parses file-only patterns', () => {
      const content = `
legacy/**
*.generated.ts
src/vendor/
`;
      const { patterns, warnings } = parseIgnoreContent(content);

      expect(warnings).toHaveLength(0);
      expect(patterns).toHaveLength(3);

      expect(patterns[0].type).toBe('file');
      expect(patterns[0].filePattern).toBe('legacy/**');
      expect(patterns[0].rulePattern).toBeNull();

      expect(patterns[1].type).toBe('file');
      expect(patterns[1].filePattern).toBe('*.generated.ts');

      expect(patterns[2].type).toBe('file');
      expect(patterns[2].filePattern).toBe('src/vendor/');
    });

    it('parses rule-only patterns', () => {
      const content = `
eslint:no-console
semgrep:javascript.lang.security.audit.dangerous-exec
typescript:TS2322
`;
      const { patterns, warnings } = parseIgnoreContent(content);

      expect(warnings).toHaveLength(0);
      expect(patterns).toHaveLength(3);

      expect(patterns[0].type).toBe('rule');
      expect(patterns[0].rulePattern).toBe('eslint:no-console');
      expect(patterns[0].filePattern).toBeNull();

      expect(patterns[1].type).toBe('rule');
      expect(patterns[1].rulePattern).toBe('semgrep:javascript.lang.security.audit.dangerous-exec');

      expect(patterns[2].type).toBe('rule');
      expect(patterns[2].rulePattern).toBe('typescript:TS2322');
    });

    it('parses combined patterns (gate:rule:path)', () => {
      const content = `
semgrep:dangerous-rule:test/**
eslint:no-console:src/debug/**
`;
      const { patterns, warnings } = parseIgnoreContent(content);

      expect(warnings).toHaveLength(0);
      expect(patterns).toHaveLength(2);

      expect(patterns[0].type).toBe('combined');
      expect(patterns[0].rulePattern).toBe('semgrep:dangerous-rule');
      expect(patterns[0].filePattern).toBe('test/**');

      expect(patterns[1].type).toBe('combined');
      expect(patterns[1].rulePattern).toBe('eslint:no-console');
      expect(patterns[1].filePattern).toBe('src/debug/**');
    });

    it('handles rules with colons in the rule ID', () => {
      const content = `semgrep:javascript.lang.security:test/**`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('combined');
      expect(patterns[0].rulePattern).toBe('semgrep:javascript.lang.security');
      expect(patterns[0].filePattern).toBe('test/**');
    });

    it('skips empty lines', () => {
      const content = `
legacy/**

src/vendor/

`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(2);
    });

    it('skips comment lines', () => {
      const content = `
# This is a comment
legacy/**
# Another comment
src/vendor/
`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(2);
      expect(patterns[0].filePattern).toBe('legacy/**');
      expect(patterns[1].filePattern).toBe('src/vendor/');
    });

    it('trims whitespace from patterns', () => {
      const content = `  legacy/**  `;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].filePattern).toBe('legacy/**');
    });

    it('tracks line numbers', () => {
      const content = `# Comment
legacy/**
# Another comment
eslint:no-console`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns[0].line).toBe(2);
      expect(patterns[1].line).toBe(4);
    });

    it('preserves raw pattern text', () => {
      const content = `eslint:no-console:test/**`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns[0].raw).toBe('eslint:no-console:test/**');
    });

    it('treats unknown gate prefix as file pattern', () => {
      const content = `unknown:something`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('file');
      expect(patterns[0].filePattern).toBe('unknown:something');
    });

    it('recognizes all known gate prefixes', () => {
      const content = `
eslint:rule1
typescript:rule2
ts:rule3
semgrep:rule4
gitleaks:rule5
`;
      const { patterns } = parseIgnoreContent(content);

      expect(patterns).toHaveLength(5);
      patterns.forEach((p) => {
        expect(p.type).toBe('rule');
      });
    });
  });

  describe('getPatternSummary', () => {
    it('counts patterns by type', () => {
      const patterns = [
        { type: 'file' as const, filePattern: 'a', rulePattern: null, line: 1, raw: 'a' },
        { type: 'file' as const, filePattern: 'b', rulePattern: null, line: 2, raw: 'b' },
        { type: 'rule' as const, filePattern: null, rulePattern: 'c', line: 3, raw: 'c' },
        { type: 'combined' as const, filePattern: 'd', rulePattern: 'e', line: 4, raw: 'e:d' },
      ];

      const summary = getPatternSummary(patterns);

      expect(summary.total).toBe(4);
      expect(summary.filePatterns).toBe(2);
      expect(summary.rulePatterns).toBe(1);
      expect(summary.combinedPatterns).toBe(1);
    });

    it('handles empty array', () => {
      const summary = getPatternSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.filePatterns).toBe(0);
      expect(summary.rulePatterns).toBe(0);
      expect(summary.combinedPatterns).toBe(0);
    });
  });
});
