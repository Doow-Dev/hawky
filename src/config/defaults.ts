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
export const TYPESCRIPT_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the Build gate
 */
export const BUILD_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 600, // 10 minutes
  command: '', // Auto-detected from package.json or .claude/COMMANDS.md
};

/**
 * Default configuration for the Test gate
 */
export const TEST_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 600, // 10 minutes
  command: '', // Auto-detected from package.json or .claude/COMMANDS.md
};

/**
 * Default configuration for the ESLint gate
 */
export const ESLINT_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the Semgrep gate
 */
export const SEMGREP_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 600, // 10 minutes
  rulesets: 'p/security-audit',
};

/**
 * Default configuration for the Gitleaks gate
 */
export const GITLEAKS_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the Design System gate
 */
export const DESIGN_SYSTEM_GATE_DEFAULTS: GateConfig = {
  enabled: false, // Opt-in by default — not all projects use design systems
  blocking: true,
  timeout: 120, // 2 minutes — static analysis is fast
  bannedClasses: [],
  spacingScale: [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384],
  fontSizeScale: [10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128],
  allowHardcodedColors: false,
};

/**
 * Map of gate names to their default configurations
 */
export const GATE_DEFAULTS: Record<GateName, GateConfig> = {
  typescript: TYPESCRIPT_GATE_DEFAULTS,
  build: BUILD_GATE_DEFAULTS,
  test: TEST_GATE_DEFAULTS,
  eslint: ESLINT_GATE_DEFAULTS,
  semgrep: SEMGREP_GATE_DEFAULTS,
  gitleaks: GITLEAKS_GATE_DEFAULTS,
  'design-system': DESIGN_SYSTEM_GATE_DEFAULTS,
};

/**
 * Default grace period configuration
 */
export const GRACE_PERIOD_DEFAULTS: GracePeriodConfig = {
  active: false,
  endDate: null,
};

/**
 * Complete default configuration
 */
export const DEFAULT_CONFIG: HawkyConfig = {
  failFast: true,
  gates: { ...GATE_DEFAULTS },
  gracePeriod: { ...GRACE_PERIOD_DEFAULTS },
};

/**
 * Create a fresh copy of the default configuration
 * (to avoid accidental mutation of the shared default object)
 */
export function createDefaultConfig(): HawkyConfig {
  return {
    failFast: true,
    gates: {
      typescript: { ...TYPESCRIPT_GATE_DEFAULTS },
      build: { ...BUILD_GATE_DEFAULTS },
      test: { ...TEST_GATE_DEFAULTS },
      eslint: { ...ESLINT_GATE_DEFAULTS },
      semgrep: { ...SEMGREP_GATE_DEFAULTS },
      gitleaks: { ...GITLEAKS_GATE_DEFAULTS },
      'design-system': { ...DESIGN_SYSTEM_GATE_DEFAULTS },
    },
    gracePeriod: { ...GRACE_PERIOD_DEFAULTS },
  };
}
