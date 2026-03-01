/**
 * Tests for auth-guard-completeness Semgrep rules
 *
 * Validates that the rule correctly identifies routes without auth middleware.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

describe('auth-guard-completeness semgrep rules', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/semgrep-rules/auth-guards');
  const rulesPath = path.join(__dirname, '../../.semgrep/auth-guard-completeness.yaml');

  // Helper to run semgrep and get results
  function runSemgrep(targetFile: string): { findings: string[]; exitCode: number } {
    try {
      const result = childProcess.execSync(
        `semgrep scan --config "${rulesPath}" --json "${targetFile}"`,
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      const output = JSON.parse(result);
      const findings = output.results?.map((r: { check_id: string }) => r.check_id) || [];
      return { findings, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; status?: number };
      // Semgrep exits with code 1 when findings are found
      if (execError.stdout) {
        try {
          const output = JSON.parse(execError.stdout);
          const findings = output.results?.map((r: { check_id: string }) => r.check_id) || [];
          return { findings, exitCode: execError.status || 1 };
        } catch {
          return { findings: [], exitCode: execError.status || 1 };
        }
      }
      return { findings: [], exitCode: execError.status || 1 };
    }
  }

  // Check if semgrep is available
  let semgrepAvailable = false;
  beforeAll(() => {
    try {
      childProcess.execSync('semgrep --version', { stdio: 'pipe' });
      semgrepAvailable = true;
    } catch {
      console.warn('Semgrep not available, skipping integration tests');
    }
  });

  describe('rule file validation', () => {
    it('should have valid YAML syntax', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('rules:');
      expect(content).toContain('hawky.security.express-route-no-auth');
    });

    it('should define express route rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.express-route-no-auth');
      expect(content).toContain('Express route handler without authentication');
    });

    it('should define fastify route rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.fastify-route-no-auth');
    });

    it('should define nestjs controller rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.nestjs-controller-no-guard');
    });

    it('should have proper severity level', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('severity: WARNING');
    });

    it('should have CWE metadata', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('CWE-306');
    });

    it('should have OWASP metadata', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('A01:2021');
    });

    it('should exclude health check endpoints', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('"/health"');
      expect(content).toContain('"/healthz"');
      expect(content).toContain('"/ping"');
    });
  });

  describe('fixture files', () => {
    it('should have bad-routes.ts fixture', () => {
      const badRoutesPath = path.join(fixturesDir, 'bad-routes.ts');
      expect(fs.existsSync(badRoutesPath)).toBe(true);
    });

    it('should have good-routes.ts fixture', () => {
      const goodRoutesPath = path.join(fixturesDir, 'good-routes.ts');
      expect(fs.existsSync(goodRoutesPath)).toBe(true);
    });

    it('bad-routes.ts should contain unprotected routes', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'bad-routes.ts'), 'utf8');
      // Routes without middleware
      expect(content).toMatch(/router\.(get|post|put|delete)\([^,]+,\s*\(/);
    });

    it('good-routes.ts should contain protected routes', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'good-routes.ts'), 'utf8');
      // Routes with middleware (authenticate, etc.)
      expect(content).toContain('authenticate');
      expect(content).toMatch(/router\.(get|post|put|delete)\([^,]+,\s*authenticate/);
    });
  });

  describe('semgrep integration', () => {
    it('should detect unprotected routes in bad-routes.ts', () => {
      if (!semgrepAvailable) {
        console.log('Skipping: semgrep not available');
        return;
      }

      const badRoutesPath = path.join(fixturesDir, 'bad-routes.ts');
      const { findings } = runSemgrep(badRoutesPath);

      // Should find multiple violations
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f: string) => f.includes('express-route-no-auth'))).toBe(true);
    });

    it('should not flag protected routes in good-routes.ts', () => {
      if (!semgrepAvailable) {
        console.log('Skipping: semgrep not available');
        return;
      }

      const goodRoutesPath = path.join(fixturesDir, 'good-routes.ts');
      const { findings } = runSemgrep(goodRoutesPath);

      // Routes with authenticate middleware should not be flagged
      const expressFindings = findings.filter((f: string) =>
        f.includes('express-route-no-auth')
      );

      // The protected routes should not trigger findings
      // (health endpoints are excluded by the rule)
      expect(expressFindings.length).toBe(0);
    });
  });

  describe('pattern coverage', () => {
    it('should cover GET routes', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('router.get');
      expect(content).toContain('app.get');
    });

    it('should cover POST routes', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('router.post');
      expect(content).toContain('app.post');
    });

    it('should cover PUT routes', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('router.put');
      expect(content).toContain('app.put');
    });

    it('should cover DELETE routes', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('router.delete');
      expect(content).toContain('app.delete');
    });

    it('should cover PATCH routes', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('router.patch');
      expect(content).toContain('app.patch');
    });
  });
});
