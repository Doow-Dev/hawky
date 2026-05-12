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
 * Default configuration for the npm-audit gate
 */
export const NPM_AUDIT_GATE_DEFAULTS: GateConfig = {
  enabled: true,
  blocking: true,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the design-system gate
 */
export const DESIGN_SYSTEM_GATE_DEFAULTS: GateConfig = {
  enabled: false, // opt-in: only runs when design system is configured
  blocking: false,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the frontend-checks gate
 */
export const FRONTEND_CHECKS_GATE_DEFAULTS: GateConfig = {
  enabled: false, // opt-in: only runs in React/Next.js projects
  blocking: false,
  timeout: 300, // 5 minutes
};

/**
 * Default configuration for the visual gate
 */
export const VISUAL_GATE_DEFAULTS: GateConfig = {
  enabled: false, // opt-in: requires visual config with routes
  blocking: false,
  timeout: 600, // 10 minutes - screenshots can be slow
};

/**
 * Default configuration for the LLM review gate
 */
export const LLM_REVIEW_GATE_DEFAULTS: GateConfig = {
  enabled: false, // opt-in: requires LLM API credentials
  blocking: false, // LLM findings are suggestions, not blockers
  timeout: 120, // 2 minutes - LLM calls can be slow
};

/**
 * Map of gate names to their default configurations
 */
export const BACKEND_CHECKS_GATE_DEFAULTS: GateConfig = {
  enabled: false, // opt-in: only meaningful for NestJS repos
  blocking: true,
  timeout: 60,
};

export const GATE_DEFAULTS: Record<GateName, GateConfig> = {
  typescript: TYPESCRIPT_GATE_DEFAULTS,
  build: BUILD_GATE_DEFAULTS,
  test: TEST_GATE_DEFAULTS,
  eslint: ESLINT_GATE_DEFAULTS,
  semgrep: SEMGREP_GATE_DEFAULTS,
  gitleaks: GITLEAKS_GATE_DEFAULTS,
  'npm-audit': NPM_AUDIT_GATE_DEFAULTS,
  'design-system': DESIGN_SYSTEM_GATE_DEFAULTS,
  'frontend-checks': FRONTEND_CHECKS_GATE_DEFAULTS,
  'backend-checks': BACKEND_CHECKS_GATE_DEFAULTS,
  visual: VISUAL_GATE_DEFAULTS,
  'llm-review': LLM_REVIEW_GATE_DEFAULTS,
};

/**
 * Default grace period configuration
 */
export const GRACE_PERIOD_DEFAULTS: GracePeriodConfig = {
  active: false,
  endDate: null,
};

/**
 * Default visual testing configuration
 */
export const VISUAL_DEFAULTS: VisualConfig = {
  enabled: false,
  threshold: 0.1,
  viewports: [{ width: 1920, height: 1080, name: 'desktop' }],
  routes: [],
  timeout: 30000,
};

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
export const COORDINATION_DEFAULTS: CoordinationConfig = {
  enabled: true,
  concurrentPrs: true,
  contractDivergence: true,
  parallelMigrations: true,
  staleBranch: true,
  specMismatch: true,
  ownershipCollision: true,
  dependencyEnforcement: true,
  sessionHandoff: false, // opt-in: requires team config
  testCountRegression: true,
  authorshipAttribution: false, // opt-in: requires team config
  staleBranchCommits: 10,
  staleBranchDays: 2,
};

/**
 * Complete default configuration
 */
export const DEFAULT_CONFIG: HawkyConfig = {
  failFast: true,
  gates: { ...GATE_DEFAULTS },
  gracePeriod: { ...GRACE_PERIOD_DEFAULTS },
  visual: { ...VISUAL_DEFAULTS },
  coordination: { ...COORDINATION_DEFAULTS },
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
      'npm-audit': { ...NPM_AUDIT_GATE_DEFAULTS },
      'design-system': { ...DESIGN_SYSTEM_GATE_DEFAULTS },
      'frontend-checks': { ...FRONTEND_CHECKS_GATE_DEFAULTS },
      'backend-checks': { ...BACKEND_CHECKS_GATE_DEFAULTS },
      visual: { ...VISUAL_GATE_DEFAULTS },
      'llm-review': { ...LLM_REVIEW_GATE_DEFAULTS },
    },
    gracePeriod: { ...GRACE_PERIOD_DEFAULTS },
    visual: { ...VISUAL_DEFAULTS },
    coordination: { ...COORDINATION_DEFAULTS },
  };
}
