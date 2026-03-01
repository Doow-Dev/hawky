/**
 * Auto-Label Based on Scope (S052)
 *
 * Determines which GitHub labels should be applied to a PR based on
 * the files it touches. Maps file path patterns to label names.
 *
 * Does not directly call GitHub API — returns a list of labels to apply.
 * The caller is responsible for applying them via the Octokit client.
 *
 * Output: INFORM tier (informational label application).
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A mapping from file path patterns to a GitHub label
 */
export interface LabelRule {
  /** Human-readable name for this rule */
  name: string;

  /** File path patterns that trigger this label */
  patterns: RegExp[];

  /** Label to apply */
  label: string;

  /** Optional: description of what this label means */
  description?: string;
}

/**
 * A label that was matched, with context
 */
export interface MatchedLabel {
  /** The GitHub label name */
  label: string;

  /** Name of the rule that matched */
  ruleName: string;

  /** Files that triggered this label */
  triggerFiles: string[];
}

/**
 * Result of auto-label computation
 */
export interface AutoLabelResult {
  /** All labels to apply */
  labelsToApply: string[];

  /** Detailed match information */
  matchedLabels: MatchedLabel[];

  /** Files that were not covered by any rule */
  unmatchedFiles: string[];

  /** Summary message */
  message: string;
}

/**
 * Options for auto-label computation
 */
export interface AutoLabelOptions {
  /** Files changed in the PR */
  changedFiles: string[];

  /** Branch name (used for additional context) */
  branchName?: string;

  /** Label rules to apply (uses defaults if not provided) */
  rules?: LabelRule[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default label rules for a typical full-stack project
 */
export const DEFAULT_LABEL_RULES: LabelRule[] = [
  {
    name: 'Security Auth',
    patterns: [
      /^src\/(auth|security|permissions?|rbac|jwt|oauth)\//i,
      /\/(auth|login|signup|password|token|session)\.(ts|js|tsx|jsx)$/i,
      /\.env(\.example)?$/,
    ],
    label: 'security-review',
    description: 'Auth, security, permissions, or secrets files touched',
  },
  {
    name: 'API Changes',
    patterns: [
      /^src\/(api|routes?|endpoints?|controllers?)\//i,
      /\/(api|routes?|handlers?)\.(ts|js)$/i,
      /openapi\.(yaml|yml|json)$/i,
      /swagger\.(yaml|yml|json)$/i,
    ],
    label: 'api-review',
    description: 'API routes, endpoints, or spec files touched',
  },
  {
    name: 'Database',
    patterns: [
      /^src\/(models?|repositories?|db|database|migrations?)\//i,
      /\/(model|entity|schema|migration)\.(ts|js)$/i,
      /prisma\/schema\.prisma$/,
      /\.(sql)$/,
    ],
    label: 'database-review',
    description: 'Database models, migrations, or schema touched',
  },
  {
    name: 'Frontend UI',
    patterns: [
      /^src\/(components?|pages?|views?|ui)\//i,
      /\.(tsx|jsx)$/,
      /\.(css|scss|sass|less)$/i,
    ],
    label: 'ui-review',
    description: 'Frontend components, pages, or styles touched',
  },
  {
    name: 'CI/CD',
    patterns: [
      /^\.github\//,
      /^\.circleci\//,
      /action\.yml$/,
      /docker-compose/i,
      /(Dockerfile|\.dockerfile)$/i,
    ],
    label: 'ci-cd',
    description: 'GitHub Actions, CI config, or Docker files touched',
  },
  {
    name: 'Dependencies',
    patterns: [
      /^package(-lock)?\.json$/,
      /^yarn\.lock$/,
      /^pnpm-lock\.yaml$/,
      /^Gemfile(\.lock)?$/,
      /^requirements(.*)?\.txt$/,
      /^pyproject\.toml$/,
      /^Cargo(\.lock)?\.toml$/,
    ],
    label: 'dependencies',
    description: 'Package manager or dependency files touched',
  },
  {
    name: 'Tests',
    patterns: [
      /\.(test|spec)\.(ts|js|tsx|jsx)$/,
      /__tests__\//,
      /^(tests?|spec)\//i,
      /jest\.config\.(ts|js)$/,
    ],
    label: 'tests',
    description: 'Test files touched',
  },
  {
    name: 'Documentation',
    patterns: [
      /\.(md|mdx|rst|txt)$/,
      /^docs?\//i,
      /CHANGELOG/i,
      /CONTRIBUTING/i,
    ],
    label: 'documentation',
    description: 'Documentation files touched',
  },
  {
    name: 'Configuration',
    patterns: [
      /\.(yaml|yml|json|toml|ini|conf)$/,
      /tsconfig.*\.json$/,
      /\.eslintrc/,
      /\.prettierrc/,
      /babel\.config/,
    ],
    label: 'config',
    description: 'Configuration files touched',
  },
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a file matches any of a rule's patterns
 */
export function fileMatchesRule(filePath: string, rule: LabelRule): boolean {
  return rule.patterns.some((pattern) => pattern.test(filePath));
}

/**
 * Find which files triggered a specific rule
 */
export function findTriggerFiles(files: string[], rule: LabelRule): string[] {
  return files.filter((f) => fileMatchesRule(f, rule));
}

/**
 * Compute which labels should be applied to a PR based on changed files.
 * Pure function — no API calls.
 */
export function computeAutoLabels(options: AutoLabelOptions): AutoLabelResult {
  const { changedFiles, rules = DEFAULT_LABEL_RULES } = options;

  if (changedFiles.length === 0) {
    return {
      labelsToApply: [],
      matchedLabels: [],
      unmatchedFiles: [],
      message: 'No changed files — no labels to apply',
    };
  }

  const matchedLabels: MatchedLabel[] = [];
  const matchedFiles = new Set<string>();

  for (const rule of rules) {
    const triggerFiles = findTriggerFiles(changedFiles, rule);
    if (triggerFiles.length > 0) {
      matchedLabels.push({
        label: rule.label,
        ruleName: rule.name,
        triggerFiles,
      });
      triggerFiles.forEach((f) => matchedFiles.add(f));
    }
  }

  const unmatchedFiles = changedFiles.filter((f) => !matchedFiles.has(f));
  const labelsToApply = [...new Set(matchedLabels.map((m) => m.label))];

  let message: string;
  if (labelsToApply.length === 0) {
    message = 'No labels matched for the changed files';
  } else {
    message = `Applying ${labelsToApply.length} label(s): ${labelsToApply.join(', ')}`;
  }

  return {
    labelsToApply,
    matchedLabels,
    unmatchedFiles,
    message,
  };
}

// ============================================================================
// Index
// ============================================================================

export { computeAutoLabels as default };
