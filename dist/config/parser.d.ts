/**
 * Hawky Configuration Parser
 *
 * Parses .hawky.yml or .hawky.yaml configuration files.
 * Handles missing files gracefully with defaults.
 * Type coerces values where sensible (e.g., string "true" → boolean true).
 */
import type { ConfigParseResult, RawHawkyConfig } from './types';
/**
 * Parse configuration from a YAML string
 */
export declare function parseConfigString(content: string): RawHawkyConfig;
/**
 * Load and parse Hawky configuration
 *
 * @param basePath - Directory to search for config file (usually repo root)
 * @param configPath - Optional specific config file path
 * @returns Parsed configuration with defaults applied
 */
export declare function loadConfig(basePath: string, configPath?: string): ConfigParseResult;
/**
 * Load configuration from the current working directory
 * (convenience wrapper for loadConfig)
 */
export declare function loadConfigFromCwd(configPath?: string): ConfigParseResult;
//# sourceMappingURL=parser.d.ts.map