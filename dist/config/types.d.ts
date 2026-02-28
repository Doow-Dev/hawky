/**
 * Hawky Configuration Types
 *
 * Type-safe interfaces for .hawky.yml configuration.
 * Matches Sprint 1 schema from S008.
 */
/**
 * Gate names supported by Hawky
 */
export type GateName = 'typescript' | 'build' | 'test' | 'eslint' | 'semgrep' | 'gitleaks';
/**
 * All valid gate names
 */
export declare const GATE_NAMES: GateName[];
/**
 * Configuration for a single gate
 */
export interface GateConfig {
    /** Whether the gate is enabled (default: true) */
    enabled: boolean;
    /** Whether gate failure blocks the PR (default: true) */
    blocking: boolean;
    /** Timeout in seconds for gate execution (default varies by gate) */
    timeout: number;
    /** Custom command to run (optional, gates have their own defaults) */
    command?: string;
    /** Semgrep-specific: ruleset to use (default: 'p/security-audit') */
    rulesets?: string;
}
/**
 * Grace period configuration for onboarding repos
 */
export interface GracePeriodConfig {
    /** Whether grace period is currently active (computed from end_date) */
    active: boolean;
    /** End date for grace period in YYYY-MM-DD format */
    endDate: string | null;
    /** Number of sprints until grace period ends (alternative to end_date) */
    sprints?: number;
}
/**
 * Complete Hawky configuration
 */
export interface HawkyConfig {
    /** Stop running gates when a blocking gate fails (default: true) */
    failFast: boolean;
    /** Per-gate configuration */
    gates: Record<GateName, GateConfig>;
    /** Grace period settings for onboarding */
    gracePeriod: GracePeriodConfig;
}
/**
 * Raw YAML structure (before normalization)
 * Used for parsing the .hawky.yml file
 */
export interface RawHawkyConfig {
    fail_fast?: boolean | string;
    gates?: {
        [key: string]: {
            enabled?: boolean | string;
            blocking?: boolean | string;
            timeout?: number | string;
            command?: string;
            rulesets?: string;
        } | undefined;
    };
    grace_period?: {
        end_date?: string;
        sprints?: number | string;
    };
}
/**
 * Validation error from config parsing
 */
export interface ConfigValidationError {
    field: string;
    message: string;
    value?: unknown;
}
/**
 * Result from config parsing
 */
export interface ConfigParseResult {
    /** Parsed and normalized configuration */
    config: HawkyConfig;
    /** Whether a config file was found and loaded */
    configFound: boolean;
    /** Path to the config file that was loaded (if any) */
    configPath: string | null;
    /** Any validation warnings (non-fatal issues) */
    warnings: ConfigValidationError[];
}
//# sourceMappingURL=types.d.ts.map