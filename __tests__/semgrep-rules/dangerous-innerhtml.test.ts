/**
 * Tests for hawky.security.dangerous-innerhtml-* Semgrep rules
 *
 * Note: These tests validate the rule YAML structure and document expected behavior.
 * Full integration testing requires Semgrep to be installed.
 * Run `semgrep scan --config .semgrep/ __tests__/fixtures/semgrep-rules/` to test manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

describe('dangerous-innerhtml Semgrep rules', () => {
  const rulePath = path.join(__dirname, '../../.semgrep/dangerous-innerhtml.yaml');

  it('should have valid YAML syntax', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    expect(() => YAML.parse(content)).not.toThrow();
  });

  it('should have required rule structure', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as { rules: unknown[] };

    expect(rules).toHaveProperty('rules');
    expect(Array.isArray(rules.rules)).toBe(true);
    expect(rules.rules.length).toBeGreaterThanOrEqual(1);
  });

  it('should have dangerous-innerhtml-variable rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.dangerous-innerhtml-variable'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have dangerous-innerhtml-user-input rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.dangerous-innerhtml-user-input'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have dangerous-innerhtml-fetch-data rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.dangerous-innerhtml-fetch-data'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have required metadata on all rules', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{
        id: string;
        metadata?: {
          category?: string;
          cwe?: string;
          owasp?: string;
          'hawky-rule'?: boolean;
        };
      }>;
    };

    for (const rule of rules.rules) {
      expect(rule.metadata).toBeDefined();
      expect(rule.metadata?.category).toBe('security');
      expect(rule.metadata?.cwe).toContain('CWE-79');
      expect(rule.metadata?.owasp).toContain('A03:2021');
      expect(rule.metadata?.['hawky-rule']).toBe(true);
    }
  });

  it('should support JSX/TSX languages', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; languages: string[] }>;
    };

    for (const rule of rules.rules) {
      expect(rule.languages).toContain('tsx');
      expect(rule.languages).toContain('jsx');
    }
  });
});

describe('dangerous-innerhtml fixtures', () => {
  const fixturesPath = path.join(
    __dirname,
    '../fixtures/semgrep-rules/dangerous-innerhtml'
  );

  it('should have bad-innerhtml fixture', () => {
    const badPath = path.join(fixturesPath, 'bad-innerhtml.tsx');
    expect(fs.existsSync(badPath)).toBe(true);

    const content = fs.readFileSync(badPath, 'utf-8');
    expect(content).toContain('dangerouslySetInnerHTML');
    expect(content).toContain('__html: htmlContent');
    expect(content).toContain('ruleid:');
  });

  it('should have good-sanitized fixture', () => {
    const goodPath = path.join(fixturesPath, 'good-sanitized.tsx');
    expect(fs.existsSync(goodPath)).toBe(true);

    const content = fs.readFileSync(goodPath, 'utf-8');
    expect(content).toContain('DOMPurify.sanitize');
    expect(content).toContain('ok:');
  });
});
