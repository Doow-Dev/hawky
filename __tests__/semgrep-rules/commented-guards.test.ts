/**
 * Tests for hawky.security.commented-* Semgrep rules
 *
 * Note: These tests validate the rule YAML structure and document expected behavior.
 * Full integration testing requires Semgrep to be installed.
 * Run `semgrep scan --config .semgrep/ __tests__/fixtures/semgrep-rules/` to test manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

describe('commented-guards Semgrep rules', () => {
  const rulePath = path.join(__dirname, '../../.semgrep/commented-guards.yaml');

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

  it('should have commented-auth-middleware rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.commented-auth-middleware'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have commented-guard-decorator rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.commented-guard-decorator'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have commented-permission-check rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.commented-permission-check'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have commented-block-guard rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.commented-block-guard'
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
      expect(rule.metadata?.cwe).toContain('CWE-284');
      expect(rule.metadata?.owasp).toContain('A01:2021');
      expect(rule.metadata?.['hawky-rule']).toBe(true);
    }
  });
});

describe('commented-guards fixtures', () => {
  const fixturesPath = path.join(
    __dirname,
    '../fixtures/semgrep-rules/commented-guards'
  );

  it('should have bad-commented-guards fixture', () => {
    const badPath = path.join(fixturesPath, 'bad-commented-guards.ts');
    expect(fs.existsSync(badPath)).toBe(true);

    const content = fs.readFileSync(badPath, 'utf-8');
    expect(content).toContain('// @UseGuards');
    expect(content).toContain('// requireAuth');
    expect(content).toContain('ruleid:');
  });

  it('should have good-active-guards fixture', () => {
    const goodPath = path.join(fixturesPath, 'good-active-guards.ts');
    expect(fs.existsSync(goodPath)).toBe(true);

    const content = fs.readFileSync(goodPath, 'utf-8');
    expect(content).toContain('@UseGuards(AuthGuard)');
    expect(content).toContain('requireAuth,');
    expect(content).toContain('ok:');
  });
});
