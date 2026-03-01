/**
 * Tests for npm Audit Gate
 *
 * Tests the parsing logic and gate behavior.
 */

import { parseNpmAuditOutput, violationToAnnotation } from '../../src/gates/npm-audit';

describe('npm-audit gate', () => {
  describe('parseNpmAuditOutput', () => {
    it('should return empty arrays for empty JSON', () => {
      const result = parseNpmAuditOutput('{}', 'high');
      expect(result.violations).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return empty arrays for JSON without vulnerabilities', () => {
      const result = parseNpmAuditOutput('{"metadata":{}}', 'high');
      expect(result.violations).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should parse critical vulnerability as error with high threshold', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            name: 'lodash',
            severity: 'critical',
            isDirect: true,
            via: [{ title: 'Prototype Pollution', url: 'https://example.com', severity: 'critical' }],
            effects: [],
            range: '<4.17.21',
            nodes: ['node_modules/lodash'],
            fixAvailable: { name: 'lodash', version: '4.17.21', isSemVerMajor: false },
          },
        },
        metadata: {
          vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0, info: 0, total: 1 },
        },
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.violations).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);

      const violation = result.violations[0];
      expect(violation.ruleId).toBe('npm-audit-critical');
      expect(violation.file).toBe('package.json');
      expect(violation.gate).toBe('npm-audit');
      expect(violation.severity).toBe('error');
      expect(violation.message).toContain('CRITICAL');
      expect(violation.message).toContain('lodash');
    });

    it('should parse high vulnerability as error with high threshold', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          axios: {
            name: 'axios',
            severity: 'high',
            isDirect: true,
            via: ['SSRF vulnerability'],
            effects: [],
            range: '<0.21.1',
            nodes: ['node_modules/axios'],
            fixAvailable: true,
          },
        },
        metadata: {
          vulnerabilities: { critical: 0, high: 1, moderate: 0, low: 0, info: 0, total: 1 },
        },
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.violations[0].severity).toBe('error');
    });

    it('should parse moderate vulnerability as warning with high threshold', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          minimist: {
            name: 'minimist',
            severity: 'moderate',
            isDirect: false,
            via: ['Prototype Pollution'],
            effects: ['mocha'],
            range: '<1.2.6',
            nodes: ['node_modules/minimist'],
            fixAvailable: false,
          },
        },
        metadata: {
          vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 0, info: 0, total: 1 },
        },
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.violations[0].severity).toBe('warning');
    });

    it('should parse moderate as error with moderate threshold', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          minimist: {
            name: 'minimist',
            severity: 'moderate',
            isDirect: false,
            via: ['Prototype Pollution'],
            effects: [],
            range: '<1.2.6',
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {},
      });

      const result = parseNpmAuditOutput(output, 'moderate');

      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should parse low vulnerability as warning with high threshold', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          glob: {
            name: 'glob',
            severity: 'low',
            isDirect: false,
            via: ['ReDoS'],
            effects: [],
            range: '*',
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {},
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
    });

    it('should handle multiple vulnerabilities', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            name: 'lodash',
            severity: 'critical',
            isDirect: true,
            via: ['Prototype Pollution'],
            effects: [],
            range: '<4.17.21',
            nodes: [],
            fixAvailable: true,
          },
          axios: {
            name: 'axios',
            severity: 'high',
            isDirect: true,
            via: ['SSRF'],
            effects: [],
            range: '<0.21.1',
            nodes: [],
            fixAvailable: true,
          },
          minimist: {
            name: 'minimist',
            severity: 'moderate',
            isDirect: false,
            via: ['Prototype Pollution'],
            effects: [],
            range: '<1.2.6',
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {
          vulnerabilities: { critical: 1, high: 1, moderate: 1, low: 0, info: 0, total: 3 },
        },
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.violations).toHaveLength(3);
      expect(result.errors).toHaveLength(2); // critical + high
      expect(result.warnings).toHaveLength(1); // moderate
    });

    it('should handle fix available message correctly', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            name: 'lodash',
            severity: 'critical',
            isDirect: true,
            via: ['Prototype Pollution'],
            effects: [],
            range: '<4.17.21',
            nodes: [],
            fixAvailable: { name: 'lodash', version: '4.17.21', isSemVerMajor: false },
          },
        },
        metadata: {},
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.violations[0].message).toContain('fix: update to lodash@4.17.21');
    });

    it('should handle breaking change fix message', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          express: {
            name: 'express',
            severity: 'high',
            isDirect: true,
            via: ['Security issue'],
            effects: [],
            range: '<5.0.0',
            nodes: [],
            fixAvailable: { name: 'express', version: '5.0.0', isSemVerMajor: true },
          },
        },
        metadata: {},
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.violations[0].message).toContain('BREAKING');
    });

    it('should handle no fix available message', () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          pkg: {
            name: 'pkg',
            severity: 'moderate',
            isDirect: false,
            via: ['Some issue'],
            effects: [],
            range: '*',
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {},
      });

      const result = parseNpmAuditOutput(output, 'high');

      expect(result.violations[0].message).toContain('no fix available');
    });

    it('should return empty arrays for invalid JSON', () => {
      const result = parseNpmAuditOutput('not json', 'high');
      expect(result.violations).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('violationToAnnotation', () => {
    it('should create annotation with error severity', () => {
      const violation = {
        ruleId: 'npm-audit-critical',
        file: 'package.json',
        line: 1,
        column: 1,
        message: 'CRITICAL vulnerability in lodash',
        gate: 'npm-audit' as const,
        severity: 'error' as const,
      };

      const annotation = violationToAnnotation(violation, 'error');

      expect(annotation.file).toBe('package.json');
      expect(annotation.line).toBe(1);
      expect(annotation.severity).toBe('error');
      expect(annotation.ruleId).toBe('npm-audit-critical');
      expect(annotation.title).toBe('npm audit: critical');
      expect(annotation.message).toContain('lodash');
    });

    it('should create annotation with warning severity', () => {
      const violation = {
        ruleId: 'npm-audit-moderate',
        file: 'package.json',
        line: 1,
        column: 1,
        message: 'MODERATE vulnerability in minimist',
        gate: 'npm-audit' as const,
        severity: 'warning' as const,
      };

      const annotation = violationToAnnotation(violation, 'warning');

      expect(annotation.severity).toBe('warning');
      expect(annotation.title).toBe('npm audit: moderate');
    });
  });

  describe('severity threshold behavior', () => {
    const createOutput = (severity: string) =>
      JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          pkg: {
            name: 'pkg',
            severity,
            isDirect: true,
            via: ['Issue'],
            effects: [],
            range: '*',
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {},
      });

    it('should treat critical as blocking with critical threshold', () => {
      const result = parseNpmAuditOutput(createOutput('critical'), 'critical');
      expect(result.errors).toHaveLength(1);
    });

    it('should treat high as warning with critical threshold', () => {
      const result = parseNpmAuditOutput(createOutput('high'), 'critical');
      expect(result.warnings).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should treat all severities as blocking with low threshold', () => {
      for (const severity of ['critical', 'high', 'moderate', 'low']) {
        const result = parseNpmAuditOutput(createOutput(severity), 'low');
        expect(result.errors).toHaveLength(1);
        expect(result.warnings).toHaveLength(0);
      }
    });

    it('should treat info as warning with low threshold', () => {
      const result = parseNpmAuditOutput(createOutput('info'), 'low');
      expect(result.warnings).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
