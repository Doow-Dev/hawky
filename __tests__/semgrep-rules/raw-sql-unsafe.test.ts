/**
 * Tests for hawky.security.sql-injection-* Semgrep rules
 *
 * Note: These tests validate the rule YAML structure and document expected behavior.
 * Full integration testing requires Semgrep to be installed.
 * Run `semgrep scan --config .semgrep/ __tests__/fixtures/semgrep-rules/` to test manually.
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

describe('raw-sql-unsafe Semgrep rules', () => {
  const rulePath = path.join(__dirname, '../../.semgrep/raw-sql-unsafe.yaml');

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

  it('should have sql-injection-template-literal rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.sql-injection-template-literal'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have sql-injection-concatenation rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.sql-injection-concatenation'
    );
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('ERROR');
  });

  it('should have sql-injection-knex-raw rule', () => {
    const content = fs.readFileSync(rulePath, 'utf-8');
    const rules = YAML.parse(content) as {
      rules: Array<{ id: string; severity: string }>;
    };

    const rule = rules.rules.find(
      (r) => r.id === 'hawky.security.sql-injection-knex-raw'
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
      expect(rule.metadata?.cwe).toContain('CWE-89');
      expect(rule.metadata?.owasp).toContain('A03:2021');
      expect(rule.metadata?.['hawky-rule']).toBe(true);
    }
  });
});

describe('sql-injection fixtures', () => {
  const fixturesPath = path.join(
    __dirname,
    '../fixtures/semgrep-rules/sql-injection'
  );

  it('should have bad-queries fixture', () => {
    const badPath = path.join(fixturesPath, 'bad-queries.ts');
    expect(fs.existsSync(badPath)).toBe(true);

    const content = fs.readFileSync(badPath, 'utf-8');
    // Should contain vulnerable patterns
    expect(content).toContain('db.execute(`SELECT');
    expect(content).toContain('${userId}');
    expect(content).toContain('ruleid:');
  });

  it('should have good-queries fixture', () => {
    const goodPath = path.join(fixturesPath, 'good-queries.ts');
    expect(fs.existsSync(goodPath)).toBe(true);

    const content = fs.readFileSync(goodPath, 'utf-8');
    // Should contain safe patterns
    expect(content).toContain("'SELECT * FROM users WHERE id = $1'");
    expect(content).toContain('[userId]');
    expect(content).toContain('ok:');
  });
});
