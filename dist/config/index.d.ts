/**
 * Hawky Configuration Module
 *
 * Exports config types, defaults, and parser.
 */
export type { ConfigParseResult, ConfigValidationError, GateConfig, GateName, GracePeriodConfig, HawkyConfig, RawHawkyConfig, } from './types';
export { GATE_NAMES } from './types';
export { BUILD_GATE_DEFAULTS, createDefaultConfig, DEFAULT_CONFIG, ESLINT_GATE_DEFAULTS, GATE_DEFAULTS, GITLEAKS_GATE_DEFAULTS, GRACE_PERIOD_DEFAULTS, SEMGREP_GATE_DEFAULTS, TEST_GATE_DEFAULTS, TYPESCRIPT_GATE_DEFAULTS, } from './defaults';
export { loadConfig, loadConfigFromCwd, parseConfigString } from './parser';
//# sourceMappingURL=index.d.ts.map