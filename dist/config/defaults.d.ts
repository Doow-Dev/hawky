/**
 * Hawky Configuration Defaults
 *
 * Default values for all configuration options.
 * Matches Sprint 1 behavior from hawky.yml env section.
 */
import type { CoordinationConfig, GateConfig, GateName, GracePeriodConfig, HawkyConfig, VisualConfig } from './types';
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
 * Default configuration for the npm-audit gate
 */
export declare const NPM_AUDIT_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the design-system gate
 */
export declare const DESIGN_SYSTEM_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the frontend-checks gate
 */
export declare const FRONTEND_CHECKS_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the visual gate
 */
export declare const VISUAL_GATE_DEFAULTS: GateConfig;
/**
 * Default configuration for the LLM review gate
 */
export declare const LLM_REVIEW_GATE_DEFAULTS: GateConfig;
/**
 * Map of gate names to their default configurations
 */
export declare const GATE_DEFAULTS: Record<GateName, GateConfig>;
/**
 * Default grace period configuration
 */
export declare const GRACE_PERIOD_DEFAULTS: GracePeriodConfig;
/**
 * Default visual testing configuration
 */
export declare const VISUAL_DEFAULTS: VisualConfig;
/**
 * Default coordination configuration
 *
 * S096: Coordination Integration
 *
 * Tiers:
 * - BLOCK: contractDivergence (S036), parallelMigrations (S037), dependencyEnforcement (S041)
 * - WARN: concurrentPrs (S035), staleBranch (S038), specMismatch (S039),
 *         ownershipCollision (S040), testCountRegression (S043)
 * - OPT-IN: sessionHandoff (S042), authorshipAttribution (S045)
 */
export declare const COORDINATION_DEFAULTS: CoordinationConfig;
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