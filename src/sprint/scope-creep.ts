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

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Constants
// ============================================================================

/**
 * Files that are always in scope regardless of story declaration.
 * These are cross-cutting concerns that any PR might reasonably touch.
 */
export const ALWAYS_ALLOWED_PATTERNS: RegExp[] = [
  /^package(-lock)?\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^tsconfig.*\.json$/,
  /^\.github\//,
  /^CHANGELOG/i,
  /^README/i,
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Parse scope declarations from SPRINT.md story table.
 *
 * Looks for a scope column in the story row:
 * | S046 | Description | Owner | Status | src/sprint/, src/coordination/ |
 *
 * Also supports a "Scope:" annotation in the story description.
 */
export function parseScopeFromSprintMd(
  sprintMdContent: string,
  storyId: string
): string[] {
  const normalizedId = storyId.toUpperCase();

  // Try to find a 5-column table row for this story
  // | S### | Description | Owner | Status | Scope |
  const fiveColPattern = new RegExp(
    `^\\|\\s*${normalizedId}\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|([^|]+)\\|`,
    'im'
  );
  const fiveColMatch = fiveColPattern.exec(sprintMdContent);
  if (fiveColMatch) {
    return parseScopeString(fiveColMatch[1]);
  }

  // Try to find inline "Scope: ..." annotation near the story
  const scopeAnnotationPattern = new RegExp(
    `${normalizedId}[\\s\\S]{0,200}Scope:\\s*([^\n]+)`,
    'i'
  );
  const annotationMatch = scopeAnnotationPattern.exec(sprintMdContent);
  if (annotationMatch) {
    return parseScopeString(annotationMatch[1]);
  }

  return [];
}

/**
 * Parse a scope string into individual scope patterns.
 * "src/sprint/, src/coordination/, *.ts" → ['src/sprint/', 'src/coordination/', '*.ts']
 */
export function parseScopeString(scopeStr: string): string[] {
  return scopeStr
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Check if a file path is covered by a scope pattern.
 *
 * Scope patterns can be:
 * - Directory prefix: "src/sprint/" — matches any file under src/sprint/
 * - Exact file: "action.yml" — exact match
 * - Extension wildcard: "*.ts" — any .ts file
 * - Simple glob: "src/*.ts" — .ts files directly in src/
 */
export function fileMatchesScope(filePath: string, scopePattern: string): boolean {
  const pattern = scopePattern.trim();

  // Directory prefix (ends with /)
  if (pattern.endsWith('/')) {
    return filePath.startsWith(pattern) || filePath.includes(`/${pattern.slice(0, -1)}/`);
  }

  // Extension wildcard: *.ext
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1); // e.g., '.ts'
    return filePath.endsWith(ext);
  }

  // Glob with directory: src/*.ts
  if (pattern.includes('*')) {
    const [dir, glob] = pattern.split('*');
    return filePath.startsWith(dir) && filePath.endsWith(glob);
  }

  // Exact match or prefix match
  return filePath === pattern || filePath.startsWith(pattern);
}

/**
 * Check if a file is always allowed (cross-cutting concerns)
 */
export function isAlwaysAllowed(
  filePath: string,
  extraPatterns: RegExp[] = []
): boolean {
  const allPatterns = [...ALWAYS_ALLOWED_PATTERNS, ...extraPatterns];
  return allPatterns.some((p) => p.test(filePath));
}

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
export function detectScopeCreep(options: ScopeCreepOptions): ScopeCreepResult {
  const { changedFiles, branchName, sprintMdContent, alwaysAllowed = [] } = options;

  // Extract story ID from branch
  const storyIdMatch = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/.exec(branchName);
  const storyId = storyIdMatch ? storyIdMatch[1].toUpperCase() : null;

  if (!storyId) {
    return {
      hasScopeCreep: false,
      outOfScopeFiles: [],
      inScopeFiles: changedFiles,
      declaredScope: [],
      storyId: null,
      message: `Branch '${branchName}' has no story ID — scope check skipped`,
    };
  }

  // Parse declared scope
  const extraAlwaysAllowed = alwaysAllowed.map((p) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const declaredScope = parseScopeFromSprintMd(sprintMdContent, storyId);

  if (declaredScope.length === 0) {
    return {
      hasScopeCreep: false,
      outOfScopeFiles: [],
      inScopeFiles: changedFiles,
      declaredScope: [],
      storyId,
      message: `No scope declared for story ${storyId} — scope check skipped`,
    };
  }

  // Classify each file
  const outOfScopeFiles: OutOfScopeFile[] = [];
  const inScopeFiles: string[] = [];

  for (const filePath of changedFiles) {
    // Always-allowed files skip the scope check
    if (isAlwaysAllowed(filePath, extraAlwaysAllowed)) {
      inScopeFiles.push(filePath);
      continue;
    }

    // Check against declared scope patterns
    const inScope = declaredScope.some((pattern) => fileMatchesScope(filePath, pattern));
    if (inScope) {
      inScopeFiles.push(filePath);
    } else {
      outOfScopeFiles.push({
        path: filePath,
        reason: `Not covered by declared scope: ${declaredScope.join(', ')}`,
      });
    }
  }

  const hasScopeCreep = outOfScopeFiles.length > 0;

  let message: string;
  if (hasScopeCreep) {
    message =
      `${outOfScopeFiles.length} file(s) in story ${storyId}'s PR appear to be outside ` +
      `the declared scope (${declaredScope.join(', ')}). ` +
      `Verify these changes are intentional or split into a separate PR.`;
  } else {
    message = `All files are within the declared scope for story ${storyId}`;
  }

  return {
    hasScopeCreep,
    outOfScopeFiles,
    inScopeFiles,
    declaredScope,
    storyId,
    message,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format scope creep result as a PR comment section.
 * Only produces output when scope creep is detected.
 */
export function formatScopeCreepWarning(result: ScopeCreepResult): string {
  if (!result.hasScopeCreep) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');
  lines.push(
    `<summary>:warning: **Scope Creep** — ${result.outOfScopeFiles.length} file(s) outside story ${result.storyId} scope</summary>`
  );
  lines.push('');
  lines.push(result.message);
  lines.push('');
  lines.push('**Declared scope:**');
  for (const pattern of result.declaredScope) {
    lines.push(`- \`${pattern}\``);
  }
  lines.push('');
  lines.push('**Out-of-scope files:**');
  for (const file of result.outOfScopeFiles.slice(0, 10)) {
    lines.push(`- \`${file.path}\``);
  }
  if (result.outOfScopeFiles.length > 10) {
    lines.push(`- ...and ${result.outOfScopeFiles.length - 10} more`);
  }
  lines.push('');
  lines.push('**Options:**');
  lines.push('1. If intentional, add a comment explaining why these files are included');
  lines.push('2. Split out-of-scope changes into a separate PR');
  lines.push('3. Update the story scope declaration in SPRINT.md');
  lines.push('');
  lines.push('*This is a WARN — not blocking.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { detectScopeCreep as default };
