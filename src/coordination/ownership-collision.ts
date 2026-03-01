/**
 * Ownership Collision Detection (S040)
 *
 * Detects when a branch from one team domain (e.g., backend) touches
 * files that belong to another domain (e.g., frontend). This helps
 * teams stay within their scope and coordinate cross-domain changes.
 *
 * Example: A `be-*` branch touching `src/components/` should flag
 * that a frontend review/coordination is needed.
 *
 * Output: WARN tier finding.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A team domain definition with branch prefix and file ownership patterns
 */
export interface TeamDomain {
  /** Human-readable name for the domain (e.g., "Backend", "Frontend") */
  name: string;

  /** Branch name prefixes that identify this domain (e.g., ['be-', 'api-']) */
  branchPrefixes: string[];

  /** File path patterns owned by this domain */
  ownedPaths: RegExp[];
}

/**
 * A collision: a file that belongs to a different domain than the branch
 */
export interface OwnershipCollision {
  /** File path that caused the collision */
  filePath: string;

  /** The domain this branch belongs to */
  branchDomain: string;

  /** The domain that owns this file */
  fileDomain: string;
}

/**
 * Result of ownership collision check
 */
export interface OwnershipCollisionResult {
  /** Whether any collisions were detected */
  hasCollisions: boolean;

  /** All collisions found */
  collisions: OwnershipCollision[];

  /** The domain the branch belongs to (null if unrecognized) */
  branchDomain: string | null;

  /** Files that are cross-domain */
  crossDomainFiles: string[];

  /** Human-readable message */
  message: string;
}

/**
 * Options for ownership collision detection
 */
export interface OwnershipCollisionOptions {
  /** Current branch name */
  branchName: string;

  /** Files changed in the PR */
  changedFiles: string[];

  /** Domain definitions (uses defaults if not provided) */
  domains?: TeamDomain[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default domain definitions for a typical full-stack team
 */
export const DEFAULT_DOMAINS: TeamDomain[] = [
  {
    name: 'Backend',
    branchPrefixes: ['be-', 'api-', 'db-', 'infra-', 'server-'],
    ownedPaths: [
      /^src\/(api|server|controllers?|services?|models?|repositories?|db|database)\//i,
      /^(server|api|backend|lib|pkg)\//i,
      /\.(sql|rb|py|go|java|cs|rs)$/,
      /^scripts\/(db|migrate|seed)\//i,
    ],
  },
  {
    name: 'Frontend',
    branchPrefixes: ['fe-', 'ui-', 'web-', 'client-', 'design-'],
    ownedPaths: [
      /^src\/(components?|pages?|views?|styles?|hooks?|context|store|assets)\//i,
      /^(client|frontend|web|app)\//i,
      /\.(css|scss|sass|less|styl)$/,
      /\.(jsx?|tsx?)$/, // Note: overlaps with backend TS - context-dependent
      /^public\//i,
      /^assets\//i,
    ],
  },
  {
    name: 'DevOps',
    branchPrefixes: ['devops-', 'ci-', 'deploy-', 'infra-', 'k8s-', 'docker-'],
    ownedPaths: [
      /^\.github\//,
      /^\.circleci\//,
      /^(k8s|kubernetes|helm|terraform|ansible)\//i,
      /\.(dockerfile|Dockerfile)$/i,
      /^docker-compose/i,
      /\.(yaml|yml)$/, // CI/CD configs
    ],
  },
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Identify which domain a branch belongs to based on its name prefix
 */
export function identifyBranchDomain(
  branchName: string,
  domains: TeamDomain[] = DEFAULT_DOMAINS
): TeamDomain | null {
  const lowerBranch = branchName.toLowerCase();
  for (const domain of domains) {
    for (const prefix of domain.branchPrefixes) {
      if (lowerBranch.startsWith(prefix.toLowerCase())) {
        return domain;
      }
    }
  }
  return null;
}

/**
 * Identify which domain owns a specific file path
 */
export function identifyFileDomain(
  filePath: string,
  domains: TeamDomain[] = DEFAULT_DOMAINS
): TeamDomain | null {
  for (const domain of domains) {
    for (const pattern of domain.ownedPaths) {
      if (pattern.test(filePath)) {
        return domain;
      }
    }
  }
  return null;
}

/**
 * Check if a file clearly belongs to a specific domain that is NOT the branch domain.
 * Returns the owning domain if it's a definitive collision, null otherwise.
 */
export function detectFileCollision(
  filePath: string,
  branchDomain: TeamDomain,
  domains: TeamDomain[] = DEFAULT_DOMAINS
): TeamDomain | null {
  // Only flag if another domain owns the file AND the branch domain does NOT own it
  const fileDomain = identifyFileDomain(filePath, domains);

  if (!fileDomain) return null; // Unowned file — not a collision
  if (fileDomain.name === branchDomain.name) return null; // Same domain — fine
  if (branchDomain.ownedPaths.some((p) => p.test(filePath))) return null; // Branch domain also owns it

  return fileDomain;
}

/**
 * Detect ownership collisions in a PR.
 *
 * Checks if the branch (identified by name prefix) touches files
 * that belong to a different team domain.
 */
export function detectOwnershipCollisions(
  options: OwnershipCollisionOptions
): OwnershipCollisionResult {
  const { branchName, changedFiles, domains = DEFAULT_DOMAINS } = options;

  // Identify what domain this branch belongs to
  const branchDomain = identifyBranchDomain(branchName, domains);

  if (!branchDomain) {
    // Unrecognized branch — skip the check
    return {
      hasCollisions: false,
      collisions: [],
      branchDomain: null,
      crossDomainFiles: [],
      message: `Branch '${branchName}' does not match any known domain prefix — ownership check skipped`,
    };
  }

  // Find files that belong to a different domain
  const collisions: OwnershipCollision[] = [];

  for (const filePath of changedFiles) {
    const conflictingDomain = detectFileCollision(filePath, branchDomain, domains);
    if (conflictingDomain) {
      collisions.push({
        filePath,
        branchDomain: branchDomain.name,
        fileDomain: conflictingDomain.name,
      });
    }
  }

  const hasCollisions = collisions.length > 0;
  const crossDomainFiles = collisions.map((c) => c.filePath);

  let message: string;
  if (hasCollisions) {
    const domainCounts = new Map<string, number>();
    for (const collision of collisions) {
      domainCounts.set(collision.fileDomain, (domainCounts.get(collision.fileDomain) ?? 0) + 1);
    }
    const domainSummary = Array.from(domainCounts.entries())
      .map(([name, count]) => `${count} ${name} file(s)`)
      .join(', ');

    message =
      `${branchDomain.name} branch '${branchName}' touches cross-domain files: ${domainSummary}. ` +
      `Coordinate with the relevant team(s) or ensure this is intentional.`;
  } else {
    message = `No ownership collisions — all files are within ${branchDomain.name} domain`;
  }

  return {
    hasCollisions,
    collisions,
    branchDomain: branchDomain.name,
    crossDomainFiles,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format ownership collision result as a PR comment section.
 * Only produces output when collisions are detected.
 */
export function formatOwnershipCollisionWarning(result: OwnershipCollisionResult): string {
  if (!result.hasCollisions) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:warning: **Ownership Collision** — ${result.branchDomain} branch touching ${result.collisions.length} cross-domain file(s)</summary>`
  );
  lines.push('');
  lines.push(
    `This is a **${result.branchDomain}** branch, but it modifies files that belong to other domains. ` +
    'Ensure this is intentional and coordinate with the relevant team.'
  );
  lines.push('');

  // Group collisions by file domain
  const byDomain = new Map<string, string[]>();
  for (const collision of result.collisions) {
    const files = byDomain.get(collision.fileDomain) ?? [];
    files.push(collision.filePath);
    byDomain.set(collision.fileDomain, files);
  }

  for (const [domain, files] of byDomain) {
    lines.push(`**${domain} files modified:**`);
    for (const file of files.slice(0, 5)) {
      lines.push(`- \`${file}\``);
    }
    if (files.length > 5) {
      lines.push(`- ...and ${files.length - 5} more`);
    }
    lines.push('');
  }

  lines.push('**What to check:**');
  lines.push('- Is this change intentional? If so, add a comment explaining why');
  lines.push('- Have the owning team(s) reviewed this change?');
  lines.push('- Could this be split into separate PRs per domain?');
  lines.push('');
  lines.push('*This is a WARN — not blocking.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectOwnershipCollisions as default };
