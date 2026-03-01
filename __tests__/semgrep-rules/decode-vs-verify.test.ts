/**
 * Tests for hawky.security.jwt-* Semgrep rules
 *
 * Note: These tests validate the rule YAML structure and document expected behavior.
 * Full integration testing requires Semgrep to be installed.
 * Run `semgrep scan --config .semgrep/ __tests__/fixtures/semgrep-rules/` to test manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

describe('decode-vs-verify Semgrep rules', () => {
  const rulePath = path.join(__dirname, '../../.semgrep/decode-vs-verify.yaml');

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

  it('should have jwt-decode-without-verify rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.jwt-decode-without-verify'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have jwt-decode-for-user-id rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.jwt-decode-for-user-id'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have jwt-decode-in-auth-check rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.jwt-decode-in-auth-check'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should include auth-related path patterns', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; paths?: { include?: string[] } }>;
    };

    const authRule = rules.rules.find(
      (r) => r.id === 'hawky.security.jwt-decode-without-verify'
    );
    expect(authRule?.paths?.include).toContain('**/auth/**');
    expect(authRule?.paths?.include).toContain('**/guard/**');
    expect(authRule?.paths?.include).toContain('**/middleware/**');
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
      expect(rule.metadata?.cwe).toContain('CWE-347');
      expect(rule.metadata?.owasp).toContain('A02:2021');
      expect(rule.metadata?.['hawky-rule']).toBe(true);
    }
  });
});

describe('jwt-decode fixtures', () => {
  const fixturesPath = path.join(
    __dirname,
    '../fixtures/semgrep-rules/jwt-decode'
  );

  it('should have bad-decode fixture', () => {
    const badPath = path.join(fixturesPath, 'bad-decode.ts');
    expect(fs.existsSync(badPath)).toBe(true);

    const content = fs.readFileSync(badPath, 'utf-8');
    expect(content).toContain('jwt.decode');
    expect(content).toContain('decodeToken');
    expect(content).toContain('ruleid:');
  });

  it('should have good-verify fixture', () => {
    const goodPath = path.join(fixturesPath, 'good-verify.ts');
    expect(fs.existsSync(goodPath)).toBe(true);

    const content = fs.readFileSync(goodPath, 'utf-8');
    expect(content).toContain('jwt.verify');
    expect(content).toContain('verifyToken');
    expect(content).toContain('ok:');
  });
});
