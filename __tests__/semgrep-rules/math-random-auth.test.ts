/**
 * Tests for hawky.security.math-random-in-auth Semgrep rule
 *
 * Note: These tests validate the rule YAML structure and document expected behavior.
 * Full integration testing requires Semgrep to be installed.
 * Run `semgrep scan --config .semgrep/ __tests__/fixtures/semgrep-rules/` to test manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

describe('math-random-auth Semgrep rule', () => {
  const rulePath = path.join(__dirname, '../../.semgrep/math-random-auth.yaml');

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

  it('should have hawky.security.math-random-in-auth rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string; pattern?: string }>;
    };

    const authRule = rules.rules.find((r) => r.id === 'hawky.security.math-random-in-auth');
    expect(authRule).toBeDefined();
    expect(authRule?.severity).toBe('ERROR');
    expect(authRule?.pattern).toBe('Math.random()');
  });

  it('should have hawky.security.math-random-for-tokens rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const tokenRule = rules.rules.find((r) => r.id === 'hawky.security.math-random-for-tokens');
    expect(tokenRule).toBeDefined();
    expect(tokenRule?.severity).toBe('ERROR');
  });

  it('should include auth-related path patterns', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; paths?: { include?: string[] } }>;
    };

    const authRule = rules.rules.find((r) => r.id === 'hawky.security.math-random-in-auth');
    expect(authRule?.paths?.include).toContain('**/auth/**');
    expect(authRule?.paths?.include).toContain('**/*auth*');
    expect(authRule?.paths?.include).toContain('**/token/**');
    expect(authRule?.paths?.include).toContain('**/session/**');
  });

  it('should have required metadata', () => {
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
      expect(rule.metadata?.cwe).toContain('CWE-330');
      expect(rule.metadata?.owasp).toContain('A02:2021');
      expect(rule.metadata?.['hawky-rule']).toBe(true);
    }
  });
});

describe('math-random-auth fixtures', () => {
  const fixturesPath = path.join(
    __dirname,
    '../fixtures/semgrep-rules/insecure-random'
  );

  it('should have bad-service fixture', () => {
    const badPath = path.join(fixturesPath, 'bad-service.ts');
    expect(fs.existsSync(badPath)).toBe(true);

    const content = fs.readFileSync(badPath, 'utf-8');
    expect(content).toContain('Math.random()');
    expect(content).toContain('ruleid:');
  });

  it('should have good-service fixture', () => {
    const goodPath = path.join(fixturesPath, 'good-service.ts');
    expect(fs.existsSync(goodPath)).toBe(true);

    const content = fs.readFileSync(goodPath, 'utf-8');
    expect(content).toContain('randomBytes');
    expect(content).toContain('randomUUID');
    expect(content).toContain('ok:');
  });

  it('should have sample-auth/handler fixture for path-based detection', () => {
    const authPath = path.join(fixturesPath, 'sample-auth/handler.ts');
    expect(fs.existsSync(authPath)).toBe(true);

    const content = fs.readFileSync(authPath, 'utf-8');
    expect(content).toContain('Math.random()');
  });
});
