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

import { createDefaultConfig, GATE_DEFAULTS } from './defaults';
import type {
  ConfigParseResult,
  ConfigValidationError,
  GateConfig,
  GateName,
  GracePeriodConfig,
  RawHawkyConfig,
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
