/**
 * Hawky Configuration Parser
 *
 * Parses .hawky.yml or .hawky.yaml configuration files.
 * Handles missing files gracefully with defaults.
 * Type coerces values where sensible (e.g., string "true" → boolean true).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as core from '@actions/core';

import { COORDINATION_DEFAULTS, createDefaultConfig, GATE_DEFAULTS, VISUAL_DEFAULTS } from './defaults';
import type {
  ConfigParseResult,
  ConfigValidationError,
  CoordinationConfig,
  GateConfig,
  GateName,
  GracePeriodConfig,
  RawHawkyConfig,
  ViewportConfig,
  VisualConfig,
} from './types';
import { GATE_NAMES } from './types';

/**
 * Default config file names to search for (in order of priority)
 */
const CONFIG_FILE_NAMES = ['.hawky.yml', '.hawky.yaml'];

/**
 * Coerce a value to boolean
 * Handles: true, false, "true", "false", "yes", "no", 1, 0
 */
function toBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === 'yes' || lower === '1') {
      return true;
    }
    if (lower === 'false' || lower === 'no' || lower === '0') {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return defaultValue;
}

/**
 * Coerce a value to number
 * Handles: numbers and numeric strings
 */
function toNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

/**
 * Coerce a value to string (or undefined if empty)
 */
function toString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

/**
 * Check if a gate name is valid
 */
function isValidGateName(name: string): name is GateName {
  return GATE_NAMES.includes(name as GateName);
}

/**
 * Parse gate configuration from raw YAML
 */
function parseGateConfig(
  gateName: GateName,
  raw: RawHawkyConfig['gates'],
  warnings: ConfigValidationError[]
): GateConfig {
  const defaults = GATE_DEFAULTS[gateName];
  const rawGate = raw?.[gateName];

  if (!rawGate) {
    return { ...defaults };
  }

  const config: GateConfig = {
    enabled: toBoolean(rawGate.enabled, defaults.enabled),
    blocking: toBoolean(rawGate.blocking, defaults.blocking),
    timeout: toNumber(rawGate.timeout, defaults.timeout),
  };

  // Optional command
  const command = toString(rawGate.command);
  if (command) {
    config.command = command;
  } else if (defaults.command !== undefined) {
    config.command = defaults.command;
  }

  // Semgrep-specific rulesets
  if (gateName === 'semgrep') {
    const rulesets = toString(rawGate.rulesets);
    if (rulesets) {
      config.rulesets = rulesets;
    } else if (defaults.rulesets) {
      config.rulesets = defaults.rulesets;
    }
  }

  // Validate timeout is positive
  if (config.timeout <= 0) {
    warnings.push({
      field: `gates.${gateName}.timeout`,
      message: `Timeout must be positive, using default (${defaults.timeout})`,
      value: config.timeout,
    });
    config.timeout = defaults.timeout;
  }

  return config;
}

/**
 * Parse visual testing configuration from raw YAML
 *
 * S070: Threshold Config
 */
function parseVisualConfig(
  raw: RawHawkyConfig['visual'],
  warnings: ConfigValidationError[]
): VisualConfig {
  const config: VisualConfig = { ...VISUAL_DEFAULTS };

  if (!raw) {
    return config;
  }

  // Parse enabled flag
  if (raw.enabled !== undefined) {
    config.enabled = toBoolean(raw.enabled, config.enabled ?? false);
  }

  // Parse threshold (0-100 range)
  if (raw.threshold !== undefined) {
    const threshold = typeof raw.threshold === 'string' ? parseFloat(raw.threshold) : raw.threshold;
    if (typeof threshold === 'number' && !isNaN(threshold)) {
      if (threshold < 0 || threshold > 100) {
        warnings.push({
          field: 'visual.threshold',
          message: 'Threshold must be between 0 and 100, using default (0.1)',
          value: raw.threshold,
        });
      } else {
        config.threshold = threshold;
      }
    }
  }

  // Parse viewports
  if (raw.viewports && Array.isArray(raw.viewports)) {
    const parsedViewports: ViewportConfig[] = [];

    for (const vp of raw.viewports) {
      if (vp && typeof vp === 'object') {
        const width = toNumber(vp.width, 0);
        const height = toNumber(vp.height, 0);

        if (width > 0 && height > 0) {
          const viewport: ViewportConfig = { width, height };
          if (vp.name && typeof vp.name === 'string') {
            viewport.name = vp.name;
          }
          parsedViewports.push(viewport);
        } else {
          warnings.push({
            field: 'visual.viewports',
            message: 'Viewport must have positive width and height',
            value: vp,
          });
        }
      }
    }

    if (parsedViewports.length > 0) {
      config.viewports = parsedViewports;
    }
  }

  // Parse routes
  if (raw.routes && Array.isArray(raw.routes)) {
    config.routes = raw.routes.filter(
      (r): r is string => typeof r === 'string' && r.trim().length > 0
    );
  }

  // Parse waitFor
  if (raw.wait_for) {
    const waitFor = toString(raw.wait_for);
    if (waitFor) {
      config.waitFor = waitFor;
    }
  }

  // Parse timeout
  if (raw.timeout !== undefined) {
    const timeout = toNumber(raw.timeout, config.timeout ?? 30000);
    if (timeout > 0) {
      config.timeout = timeout;
    } else {
      warnings.push({
        field: 'visual.timeout',
        message: 'Timeout must be positive, using default (30000)',
        value: raw.timeout,
      });
    }
  }

  return config;
}

/**
 * Parse grace period configuration from raw YAML
 */
function parseGracePeriod(
  raw: RawHawkyConfig['grace_period'],
  warnings: ConfigValidationError[]
): GracePeriodConfig {
  const config: GracePeriodConfig = {
    active: false,
    endDate: null,
  };

  if (!raw) {
    return config;
  }

  let endDate: string | null = null;

  // Support end_date directly
  if (raw.end_date) {
    const dateStr = toString(raw.end_date);
    if (dateStr) {
      // Validate date format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        endDate = dateStr;
      } else {
        warnings.push({
          field: 'grace_period.end_date',
          message: 'Invalid date format, expected YYYY-MM-DD',
          value: raw.end_date,
        });
      }
    }
  }

  // Support sprints (compute end_date from today + N * 14 days)
  if (!endDate && raw.sprints !== undefined) {
    const sprints = toNumber(raw.sprints, 0);
    if (sprints > 0) {
      const d = new Date();
      d.setDate(d.getDate() + sprints * 14);
      const computed = d.toISOString().split('T')[0];
      endDate = computed ?? null;
      config.sprints = sprints;
    } else if (sprints !== 0) {
      warnings.push({
        field: 'grace_period.sprints',
        message: 'Sprints must be a positive number',
        value: raw.sprints,
      });
    }
  }

  if (endDate) {
    config.endDate = endDate;
    // Check if grace period is active (end_date is in the future)
    const todayParts = new Date().toISOString().split('T');
    const today = todayParts[0] ?? '';
    config.active = today <= endDate;
  }

  return config;
}

/**
 * Parse coordination configuration from raw YAML
 *
 * S096: Coordination Integration
 */
function parseCoordinationConfig(
  raw: RawHawkyConfig['coordination'],
  _warnings: ConfigValidationError[]
): CoordinationConfig {
  const config: CoordinationConfig = { ...COORDINATION_DEFAULTS };

  if (!raw) {
    return config;
  }

  // Parse master toggle
  if (raw.enabled !== undefined) {
    config.enabled = toBoolean(raw.enabled, config.enabled);
  }

  // Parse individual check toggles
  if (raw.concurrent_prs !== undefined) {
    config.concurrentPrs = toBoolean(raw.concurrent_prs, config.concurrentPrs);
  }
  if (raw.contract_divergence !== undefined) {
    config.contractDivergence = toBoolean(raw.contract_divergence, config.contractDivergence);
  }
  if (raw.parallel_migrations !== undefined) {
    config.parallelMigrations = toBoolean(raw.parallel_migrations, config.parallelMigrations);
  }
  if (raw.stale_branch !== undefined) {
    config.staleBranch = toBoolean(raw.stale_branch, config.staleBranch);
  }
  if (raw.spec_mismatch !== undefined) {
    config.specMismatch = toBoolean(raw.spec_mismatch, config.specMismatch);
  }
  if (raw.ownership_collision !== undefined) {
    config.ownershipCollision = toBoolean(raw.ownership_collision, config.ownershipCollision);
  }
  if (raw.dependency_enforcement !== undefined) {
    config.dependencyEnforcement = toBoolean(raw.dependency_enforcement, config.dependencyEnforcement);
  }
  if (raw.session_handoff !== undefined) {
    config.sessionHandoff = toBoolean(raw.session_handoff, config.sessionHandoff);
  }
  if (raw.test_count_regression !== undefined) {
    config.testCountRegression = toBoolean(raw.test_count_regression, config.testCountRegression);
  }
  if (raw.authorship_attribution !== undefined) {
    config.authorshipAttribution = toBoolean(raw.authorship_attribution, config.authorshipAttribution);
  }

  // Parse thresholds
  if (raw.stale_branch_commits !== undefined) {
    config.staleBranchCommits = toNumber(raw.stale_branch_commits, config.staleBranchCommits);
  }
  if (raw.stale_branch_days !== undefined) {
    config.staleBranchDays = toNumber(raw.stale_branch_days, config.staleBranchDays);
  }

  return config;
}

/**
 * Find the config file in the given directory
 * Returns the full path if found, null otherwise
 */
function findConfigFile(basePath: string, configPath?: string): string | null {
  // If specific config path is provided, check only that
  if (configPath) {
    const fullPath = path.isAbsolute(configPath) ? configPath : path.join(basePath, configPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  // Search for default config file names
  for (const fileName of CONFIG_FILE_NAMES) {
    const fullPath = path.join(basePath, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Parse configuration from a YAML string
 */
export function parseConfigString(content: string): RawHawkyConfig {
  const parsed = yaml.parse(content);
  return parsed || {};
}

/**
 * Load and parse Hawky configuration
 *
 * @param basePath - Directory to search for config file (usually repo root)
 * @param configPath - Optional specific config file path
 * @returns Parsed configuration with defaults applied
 */
export function loadConfig(basePath: string, configPath?: string): ConfigParseResult {
  const warnings: ConfigValidationError[] = [];
  const config = createDefaultConfig();

  // Find config file
  const foundPath = findConfigFile(basePath, configPath);

  if (!foundPath) {
    core.info(`No .hawky.yml found in ${basePath} — using defaults`);
    return {
      config,
      configFound: false,
      configPath: null,
      warnings,
    };
  }

  core.info(`Found configuration: ${foundPath}`);

  // Read and parse YAML
  let rawConfig: RawHawkyConfig;
  try {
    const content = fs.readFileSync(foundPath, 'utf8');
    rawConfig = parseConfigString(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    core.warning(`Failed to parse ${foundPath}: ${message}`);
    warnings.push({
      field: 'file',
      message: `Failed to parse config file: ${message}`,
    });
    return {
      config,
      configFound: true,
      configPath: foundPath,
      warnings,
    };
  }

  // Parse top-level fail_fast
  if (rawConfig.fail_fast !== undefined) {
    config.failFast = toBoolean(rawConfig.fail_fast, config.failFast);
  }

  // Parse per-gate configuration
  if (rawConfig.gates) {
    // Check for unknown gate names
    for (const key of Object.keys(rawConfig.gates)) {
      if (!isValidGateName(key)) {
        warnings.push({
          field: `gates.${key}`,
          message: `Unknown gate '${key}', will be ignored. Valid gates: ${GATE_NAMES.join(', ')}`,
        });
      }
    }

    // Parse known gates
    for (const gateName of GATE_NAMES) {
      config.gates[gateName] = parseGateConfig(gateName, rawConfig.gates, warnings);
    }
  }

  // Parse grace period
  config.gracePeriod = parseGracePeriod(rawConfig.grace_period, warnings);

  // Parse visual config
  config.visual = parseVisualConfig(rawConfig.visual, warnings);

  // Parse coordination config
  config.coordination = parseCoordinationConfig(rawConfig.coordination, warnings);

  return {
    config,
    configFound: true,
    configPath: foundPath,
    warnings,
  };
}

/**
 * Load configuration from the current working directory
 * (convenience wrapper for loadConfig)
 */
export function loadConfigFromCwd(configPath?: string): ConfigParseResult {
  return loadConfig(process.cwd(), configPath);
}
