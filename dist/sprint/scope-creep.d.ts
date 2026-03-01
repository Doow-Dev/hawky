/**
 * Scope Creep Detection (S051)
 *
 * Detects when a PR touches files that fall outside the declared scope
 * of its story. The scope can be declared inline in SPRINT.md via a
 * "Scope" column, or parsed from a story spec file.
 *
 * Scope format: comma-separated paths or glob-like patterns
 * Example scope: "src/coordination/, src/sprint/"
 *
 * Output: WARN tier finding.
 */
/**
 * A file that is outside the declared scope
 */
export interface OutOfScopeFile {
    /** The file path */
    path: string;
    /** Why it's out of scope */
    reason: string;
}
/**
 * Result of scope creep detection
 */
export interface ScopeCreepResult {
    /** Whether out-of-scope files were detected */
    hasScopeCreep: boolean;
    /** Files that are out of scope */
    outOfScopeFiles: OutOfScopeFile[];
    /** Files that are within scope */
    inScopeFiles: string[];
    /** The declared scope patterns */
    declaredScope: string[];
    /** Story ID this check is for */
    storyId: string | null;
    /** Human-readable message */
    message: string;
}
/**
 * Options for scope creep detection
 */
export interface ScopeCreepOptions {
    /** Files changed in the PR */
    changedFiles: string[];
    /** Branch name (used to extract story ID) */
    branchName: string;
    /** Content of SPRINT.md (used to look up scope) */
    sprintMdContent: string;
    /**
     * Additional scope declarations (path prefixes or patterns allowed globally).
     * These files are always considered in-scope regardless of story scope.
     */
    alwaysAllowed?: string[];
}
/**
 * Files that are always in scope regardless of story declaration.
 * These are cross-cutting concerns that any PR might reasonably touch.
 */
export declare const ALWAYS_ALLOWED_PATTERNS: RegExp[];
/**
 * Parse scope declarations from SPRINT.md story table.
 *
 * Looks for a scope column in the story row:
 * | S046 | Description | Owner | Status | src/sprint/, src/coordination/ |
 *
 * Also supports a "Scope:" annotation in the story description.
 */
export declare function parseScopeFromSprintMd(sprintMdContent: string, storyId: string): string[];
/**
 * Parse a scope string into individual scope patterns.
 * "src/sprint/, src/coordination/, *.ts" → ['src/sprint/', 'src/coordination/', '*.ts']
 */
export declare function parseScopeString(scopeStr: string): string[];
/**
 * Check if a file path is covered by a scope pattern.
 *
 * Scope patterns can be:
 * - Directory prefix: "src/sprint/" — matches any file under src/sprint/
 * - Exact file: "action.yml" — exact match
 * - Extension wildcard: "*.ts" — any .ts file
 * - Simple glob: "src/*.ts" — .ts files directly in src/
 */
export declare function fileMatchesScope(filePath: string, scopePattern: string): boolean;
/**
 * Check if a file is always allowed (cross-cutting concerns)
 */
export declare function isAlwaysAllowed(filePath: string, extraPatterns?: RegExp[]): boolean;
/**
 * Detect scope creep in a PR.
 *
 * Algorithm:
 * 1. Extract story ID from branch name
 * 2. Look up declared scope in SPRINT.md
 * 3. If no scope declared → skip (can't detect creep)
 * 4. For each changed file, check if it falls within scope or is always-allowed
 * 5. Report out-of-scope files as WARN
 */
export declare function detectScopeCreep(options: ScopeCreepOptions): ScopeCreepResult;
/**
 * Format scope creep result as a PR comment section.
 * Only produces output when scope creep is detected.
 */
export declare function formatScopeCreepWarning(result: ScopeCreepResult): string;
export { detectScopeCreep as default };
//# sourceMappingURL=scope-creep.d.ts.map