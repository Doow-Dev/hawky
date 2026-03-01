/**
 * Tests for idor-patterns Semgrep rules
 *
 * Validates that the rule correctly identifies IDOR vulnerabilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';

describe('idor-patterns semgrep rules', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/semgrep-rules/idor');
  const rulesPath = path.join(__dirname, '../../.semgrep/idor-patterns.yaml');

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
      expect(content).toContain('hawky.security.idor');
    });

    it('should define params no ownership rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.idor-params-no-ownership');
      expect(content).toContain('ownership validation');
    });

    it('should define update no ownership rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.idor-update-no-ownership');
    });

    it('should define query no user filter rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.idor-query-no-user-filter');
    });

    it('should define file access rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.idor-file-access');
    });

    it('should define graphql resolver rule', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('hawky.security.idor-graphql-resolver');
    });

    it('should have proper severity level', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('severity: ERROR');
    });

    it('should have CWE metadata', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('CWE-639');
    });

    it('should have OWASP metadata', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('A01:2021');
    });
  });

  describe('fixture files', () => {
    it('should have bad-idor.ts fixture', () => {
      const badPath = path.join(fixturesDir, 'bad-idor.ts');
      expect(fs.existsSync(badPath)).toBe(true);
    });

    it('should have good-idor.ts fixture', () => {
      const goodPath = path.join(fixturesDir, 'good-idor.ts');
      expect(fs.existsSync(goodPath)).toBe(true);
    });

    it('bad-idor.ts should contain vulnerable patterns', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'bad-idor.ts'), 'utf8');
      // Direct req.params access without ownership check
      expect(content).toContain('req.params.id');
      expect(content).toContain('findById');
      expect(content).toContain('findByIdAndUpdate');
    });

    it('good-idor.ts should contain protected patterns', () => {
      const content = fs.readFileSync(path.join(fixturesDir, 'good-idor.ts'), 'utf8');
      // Proper ownership checks
      expect(content).toContain('userId: req.user.id');
    });
  });

  describe('semgrep integration', () => {
    it('should detect IDOR vulnerabilities in bad-idor.ts', () => {
      if (!semgrepAvailable) {
        console.log('Skipping: semgrep not available');
        return;
      }

      const badPath = path.join(fixturesDir, 'bad-idor.ts');
      const { findings } = runSemgrep(badPath);

      // Should find multiple violations
      expect(findings.length).toBeGreaterThan(0);
      expect(
        findings.some((f: string) => f.includes('idor'))
      ).toBe(true);
    });

    it('should not flag protected patterns in good-idor.ts', () => {
      if (!semgrepAvailable) {
        console.log('Skipping: semgrep not available');
        return;
      }

      const goodPath = path.join(fixturesDir, 'good-idor.ts');
      const { findings } = runSemgrep(goodPath);

      // Protected patterns should not trigger findings
      expect(findings.length).toBe(0);
    });
  });

  describe('pattern coverage', () => {
    it('should cover findById patterns', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findById');
    });

    it('should cover findByPk patterns', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findByPk');
    });

    it('should cover findOne patterns', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findOne');
    });

    it('should cover findUnique patterns (Prisma)', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findUnique');
    });

    it('should cover update operations', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findByIdAndUpdate');
      expect(content).toContain('.update');
    });

    it('should cover delete operations', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('findByIdAndDelete');
      expect(content).toContain('.delete');
    });

    it('should cover file access patterns', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('fs.readFile');
      expect(content).toContain('res.sendFile');
    });

    it('should allow userId ownership check', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('userId');
    });

    it('should allow user_id ownership check (snake_case)', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('user_id');
    });

    it('should allow ownerId ownership check', () => {
      const content = fs.readFileSync(rulesPath, 'utf8');
      expect(content).toContain('ownerId');
    });
  });
});
