/**
 * Hawky Configuration Defaults
 *
 * Default values for all configuration options.
 * Matches Sprint 1 behavior from hawky.yml env section.
 */
import type { GateConfig, GateName, GracePeriodConfig, HawkyConfig } from './types';
/**
 * Default configuration for the TypeScript gate
 */
export declare const TYPESCRIPT_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the Build gate
 */
export declare const BUILD_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the Test gate
 */
export declare const TEST_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the ESLint gate
 */
export declare const ESLINT_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the Semgrep gate
 */
export declare const SEMGREP_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the Gitleaks gate
 */
export declare const GITLEAKS_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the npm Audit gate
 */
export declare const NPM_AUDIT_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the Design System gate
 */
export declare const DESIGN_SYSTEM_GATE_DEFAULTS: GateConfig;
/**
 * Map of gate names to their default configurations
 */
export declare const GATE_DEFAULTS: Record<GateName, GateConfig>;
/**
 * Default grace period configuration
 */
export declare const GRACE_PERIOD_DEFAULTS: GracePeriodConfig;
/**
 * Complete default configuration
 */
export declare const DEFAULT_CONFIG: HawkyConfig;
/**
 * Create a fresh copy of the default configuration
 * (to avoid accidental mutation of the shared default object)
 */
export declare function createDefaultConfig(): HawkyConfig;
//# sourceMappingURL=defaults.d.ts.map