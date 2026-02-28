/**
 * Unit tests for Hawky config parser
 *
 * Tests parsing of .hawky.yml configuration files.
 */

import * as path from 'path';
import * as fs from 'fs';
import { parseConfigString, loadConfig } from '../../src/config/parser';
import { createDefaultConfig } from '../../src/config/defaults';

// Temp directory for test config files
const TEST_CONFIG_DIR = path.join(__dirname, '..', 'fixtures', 'config');

// Ensure test config directory exists
beforeAll(() => {
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
});

// Clean up test files after each test
afterEach(() => {
  const ymlPath = path.join(TEST_CONFIG_DIR, '.hawky.yml');
  const yamlPath = path.join(TEST_CONFIG_DIR, '.hawky.yaml');
  if (fs.existsSync(ymlPath)) fs.unlinkSync(ymlPath);
  if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath);
});

describe('config/parser', () => {
  describe('parseConfigString', () => {
    it('parses empty config', () => {
      const raw = parseConfigString('');
      expect(raw).toEqual({});
    });

    it('parses fail_fast boolean', () => {
      const raw = parseConfigString('fail_fast: false');
      expect(raw.fail_fast).toBe(false);
    });

    it('parses gate configurations', () => {
      const content = `
gates:
  typescript:
    enabled: true
    blocking: false
    timeout: 120
  eslint:
    enabled: false
`;
      const raw = parseConfigString(content);

      expect(raw.gates).toBeDefined();
      expect(raw.gates?.typescript?.enabled).toBe(true);
      expect(raw.gates?.typescript?.blocking).toBe(false);
      expect(raw.gates?.typescript?.timeout).toBe(120);
      expect(raw.gates?.eslint?.enabled).toBe(false);
    });

    it('parses grace_period with end_date', () => {
      const content = `
grace_period:
  end_date: '2026-03-15'
`;
      const raw = parseConfigString(content);

      expect(raw.grace_period?.end_date).toBe('2026-03-15');
    });

    it('parses grace_period with sprints', () => {
      const content = `
grace_period:
  sprints: 2
`;
      const raw = parseConfigString(content);

      expect(raw.grace_period?.sprints).toBe(2);
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.configFound).toBe(false);
      expect(result.configPath).toBeNull();
      expect(result.warnings).toHaveLength(0);
      expect(result.config).toEqual(createDefaultConfig());
    });

    it('loads .hawky.yml file', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), 'fail_fast: false');

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.configFound).toBe(true);
      expect(result.configPath).toContain('.hawky.yml');
      expect(result.config.failFast).toBe(false);
    });

    it('prefers .hawky.yml over .hawky.yaml', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), 'fail_fast: false');
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yaml'), 'fail_fast: true');

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.configPath).toContain('.hawky.yml');
      expect(result.config.failFast).toBe(false);
    });

    it('coerces string "true" to boolean true', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  typescript:
    enabled: "true"
`);

      const result = loadConfig(TEST_CONFIG_DIR);
      expect(result.config.gates.typescript.enabled).toBe(true);
    });

    it('coerces string "false" to boolean false', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  typescript:
    enabled: "false"
`);

      const result = loadConfig(TEST_CONFIG_DIR);
      expect(result.config.gates.typescript.enabled).toBe(false);
    });

    it('coerces string numbers to numbers', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  typescript:
    timeout: "300"
`);

      const result = loadConfig(TEST_CONFIG_DIR);
      expect(result.config.gates.typescript.timeout).toBe(300);
    });

    it('warns on unknown gate names', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  unknown_gate:
    enabled: true
`);

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].field).toContain('unknown_gate');
    });

    it('warns on invalid timeout', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  typescript:
    timeout: -10
`);

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.warnings.some((w) => w.field.includes('timeout'))).toBe(true);
      // Should fall back to default
      expect(result.config.gates.typescript.timeout).toBeGreaterThan(0);
    });

    it('warns on invalid date format', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
grace_period:
  end_date: 'invalid-date'
`);

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.warnings.some((w) => w.field.includes('end_date'))).toBe(true);
      expect(result.config.gracePeriod.endDate).toBeNull();
    });

    it('computes grace period from sprints', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
grace_period:
  sprints: 1
`);

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.config.gracePeriod.sprints).toBe(1);
      expect(result.config.gracePeriod.endDate).not.toBeNull();
      // End date should be ~14 days from now
      const endDate = new Date(result.config.gracePeriod.endDate!);
      const now = new Date();
      const diff = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBeGreaterThanOrEqual(13);
      expect(diff).toBeLessThanOrEqual(15);
    });

    it('loads specific config path', () => {
      const customPath = path.join(TEST_CONFIG_DIR, 'custom.yml');
      fs.writeFileSync(customPath, 'fail_fast: false');

      try {
        const result = loadConfig(TEST_CONFIG_DIR, 'custom.yml');

        expect(result.configFound).toBe(true);
        expect(result.configPath).toContain('custom.yml');
        expect(result.config.failFast).toBe(false);
      } finally {
        fs.unlinkSync(customPath);
      }
    });

    it('returns defaults on parse error', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), '{ invalid yaml content');

      const result = loadConfig(TEST_CONFIG_DIR);

      expect(result.configFound).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      // Should still return default config
      expect(result.config).toBeDefined();
    });
  });

  describe('gate configuration', () => {
    it('applies custom command', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  typescript:
    command: "tsc --project ./tsconfig.custom.json"
`);

      const result = loadConfig(TEST_CONFIG_DIR);
      expect(result.config.gates.typescript.command).toBe('tsc --project ./tsconfig.custom.json');
    });

    it('applies semgrep rulesets', () => {
      fs.writeFileSync(path.join(TEST_CONFIG_DIR, '.hawky.yml'), `
gates:
  semgrep:
    rulesets: "p/owasp-top-ten"
`);

      const result = loadConfig(TEST_CONFIG_DIR);
      expect(result.config.gates.semgrep.rulesets).toBe('p/owasp-top-ten');
    });
  });
});
