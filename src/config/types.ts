/**
 * Hawky Configuration Types
 *
 * Type-safe interfaces for .hawky.yml configuration.
 * Matches Sprint 1 schema from S008.
 */

import type { StackType, StacksConfig } from '../stack/types';

// Re-export stack types for convenience
export type { StackType, StacksConfig, StackOverrideConfig } from '../stack/types';

/**
 * Gate names supported by Hawky
 */
export type GateName =
  | 'typescript'
  | 'build'
  | 'test'
  | 'eslint'
  | 'semgrep'
  | 'gitleaks'
  | 'npm-audit'
  | 'design-system'
  | 'frontend-checks'
  | 'backend-checks'
  | 'visual'
  | 'llm-review';

/**
 * All valid gate names
 */
export const GATE_NAMES: GateName[] = [
  'typescript',
  'build',
  'test',
  'eslint',
  'semgrep',
  'gitleaks',
  'npm-audit',
  'design-system',
  'frontend-checks',
  'backend-checks',
  'visual',
  'llm-review',
];

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

  /** Design-system-specific: banned Tailwind class patterns */
  bannedClasses?: string[];

  /** Design-system-specific: allowed spacing scale in px (default: 4,8,12,16,20,24,32,40,48,64) */
  spacingScale?: number[];

  /** Design-system-specific: allowed font sizes in px (default: 12,14,16,18,20,24,30,36,48,60,72) */
  fontSizeScale?: number[];

  /** Design-system-specific: whether to allow hardcoded colors (default: false) */
  allowHardcodedColors?: boolean;
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
 * Viewport configuration for visual testing
 */
export interface ViewportConfig {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Optional viewport name for identification */
  name?: string;
}

/**
 * Visual regression testing configuration
 *
 * S070: Threshold Config
 */
export interface VisualConfig {
  /** Whether visual testing is enabled (default: false) */
  enabled?: boolean;
  /** Diff threshold percentage (default: 0.1) */
  threshold?: number;
  /** Viewports to test (default: desktop 1920x1080) */
  viewports?: ViewportConfig[];
  /** Routes/URLs to test */
  routes?: string[];
  /** CSS selector to wait for before capture */
  waitFor?: string;
  /** Timeout in ms for waitFor (default: 30000) */
  timeout?: number;
}

/**
 * Coordination configuration for cross-agent coordination features
 *
 * S096: Coordination Integration
 */
export interface CoordinationConfig {
  /** Master toggle for all coordination checks (default: true) */
  enabled: boolean;

  /** S035: Detect concurrent PRs touching same files (WARN tier) */
  concurrentPrs: boolean;

  /** S036: Detect API contract divergence with frontend PRs (BLOCK tier) */
  contractDivergence: boolean;

  /** S037: Detect parallel database migrations (BLOCK tier) */
  parallelMigrations: boolean;

  /** S038: Detect stale branches (WARN tier) */
  staleBranch: boolean;

  /** S039: Detect spec files updated after branch cut (WARN tier) */
  specMismatch: boolean;

  /** S040: Detect cross-domain file ownership collisions (WARN tier) */
  ownershipCollision: boolean;

  /** S041: Enforce story dependencies before merge (BLOCK tier) */
  dependencyEnforcement: boolean;

  /** S042: Generate handoff notifications on merge (WARN tier, opt-in) */
  sessionHandoff: boolean;

  /** S043: Detect test count regression (WARN tier) */
  testCountRegression: boolean;

  /** S045: Detect mixed commit authorship (WARN tier, opt-in) */
  authorshipAttribution: boolean;

  /** Threshold for stale branch: commits behind (default: 10) */
  staleBranchCommits: number;

  /** Threshold for stale branch: days old (default: 2) */
  staleBranchDays: number;
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

  /** Visual regression testing settings (S070) */
  visual?: VisualConfig;

  /** Stack detection and execution settings (E011) */
  stacks?: StacksConfig;

  /** Cross-agent coordination settings (S096) */
  coordination: CoordinationConfig;
}

/**
 * Raw YAML structure (before normalization)
 * Used for parsing the .hawky.yml file
 */
export interface RawHawkyConfig {
  fail_fast?: boolean | string;
  gates?: {
    [key: string]:
      | {
          enabled?: boolean | string;
          blocking?: boolean | string;
          timeout?: number | string;
          command?: string;
          rulesets?: string;
        }
      | undefined;
  };
  grace_period?: {
    end_date?: string;
    sprints?: number | string;
  };
  visual?: {
    enabled?: boolean | string;
    threshold?: number | string;
    viewports?: Array<{
      width?: number | string;
      height?: number | string;
      name?: string;
    }>;
    routes?: string[];
    wait_for?: string;
    timeout?: number | string;
  };
  stacks?: {
    enabled?: StackType[] | 'auto' | string;
    disabled?: StackType[] | string[];
    [key: string]:
      | {
          enabled?: boolean | string;
          build_command?: string;
          test_command?: string;
          lint_command?: string;
          security_command?: string;
          timeout?: number | string;
        }
      | StackType[]
      | 'auto'
      | string
      | string[]
      | undefined;
  };
  coordination?: {
    enabled?: boolean | string;
    concurrent_prs?: boolean | string;
    contract_divergence?: boolean | string;
    parallel_migrations?: boolean | string;
    stale_branch?: boolean | string;
    spec_mismatch?: boolean | string;
    ownership_collision?: boolean | string;
    dependency_enforcement?: boolean | string;
    session_handoff?: boolean | string;
    test_count_regression?: boolean | string;
    authorship_attribution?: boolean | string;
    stale_branch_commits?: number | string;
    stale_branch_days?: number | string;
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
