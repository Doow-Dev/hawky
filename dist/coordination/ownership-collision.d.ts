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
/**
 * Default domain definitions for a typical full-stack team
 */
export declare const DEFAULT_DOMAINS: TeamDomain[];
/**
 * Identify which domain a branch belongs to based on its name prefix
 */
export declare function identifyBranchDomain(branchName: string, domains?: TeamDomain[]): TeamDomain | null;
/**
 * Identify which domain owns a specific file path
 */
export declare function identifyFileDomain(filePath: string, domains?: TeamDomain[]): TeamDomain | null;
/**
 * Check if a file clearly belongs to a specific domain that is NOT the branch domain.
 * Returns the owning domain if it's a definitive collision, null otherwise.
 */
export declare function detectFileCollision(filePath: string, branchDomain: TeamDomain, domains?: TeamDomain[]): TeamDomain | null;
/**
 * Detect ownership collisions in a PR.
 *
 * Checks if the branch (identified by name prefix) touches files
 * that belong to a different team domain.
 */
export declare function detectOwnershipCollisions(options: OwnershipCollisionOptions): OwnershipCollisionResult;
/**
 * Format ownership collision result as a PR comment section.
 * Only produces output when collisions are detected.
 */
export declare function formatOwnershipCollisionWarning(result: OwnershipCollisionResult): string;
export { detectOwnershipCollisions as default };
//# sourceMappingURL=ownership-collision.d.ts.map