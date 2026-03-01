/**
 * Tests for Scope Creep Detection (S051)
 */

import {
  parseScopeFromSprintMd,
  parseScopeString,
  fileMatchesScope,
  isAlwaysAllowed,
  detectScopeCreep,
  formatScopeCreepWarning,
  ALWAYS_ALLOWED_PATTERNS,
  type ScopeCreepResult,
  type ScopeCreepOptions,
} from '../../src/sprint/scope-creep';

// ============================================================================
// Test helpers
// ============================================================================

const SPRINT_MD_WITH_SCOPE = `
# Sprint Plan — Hawky

| Story | Description | Owner | Status | Scope |
|-------|-------------|-------|--------|-------|
| S046 | Story ID Validation | Luna | in-progress | src/sprint/, __tests__/sprint/ |
| S047 | Sprint Status on PR Open | Luna | backlog | src/sprint/, src/coordination/ |
| S048 | No Scope Story | Luna | backlog |
| S049 | Done Story | Luna | done | src/api/ |

## Backlog

| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S100 | Future story | Kai | backlog |
`;

const SPRINT_MD_NO_SCOPE = `
| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S046 | Story ID Validation | Luna | in-progress |
`;

function createDefaultOptions(
  changedFiles: string[],
  branchName: string,
  sprintMdContent: string = SPRINT_MD_WITH_SCOPE,
  overrides: Partial<ScopeCreepOptions> = {}
): ScopeCreepOptions {
  return {
    changedFiles,
    branchName,
    sprintMdContent,
    ...overrides,
  };
}

// ============================================================================
// parseScopeString
// ============================================================================

describe('parseScopeString', () => {
  it('should parse single scope entry', () => {
    const result = parseScopeString('src/sprint/');
    expect(result).toEqual(['src/sprint/']);
  });

  it('should parse comma-separated scope entries', () => {
    const result = parseScopeString('src/sprint/, __tests__/sprint/');
    expect(result).toEqual(['src/sprint/', '__tests__/sprint/']);
  });

  it('should trim whitespace from entries', () => {
    const result = parseScopeString(' src/sprint/ , src/coordination/ ');
    expect(result).toEqual(['src/sprint/', 'src/coordination/']);
  });

  it('should filter empty entries', () => {
    const result = parseScopeString('src/sprint/,,,src/api/');
    expect(result).toContain('src/sprint/');
    expect(result).toContain('src/api/');
    expect(result.filter((s) => s === '')).toHaveLength(0);
  });

  it('should return empty array for empty string', () => {
    expect(parseScopeString('')).toHaveLength(0);
  });
});

// ============================================================================
// parseScopeFromSprintMd
// ============================================================================

describe('parseScopeFromSprintMd', () => {
  it('should parse scope from 5-column table row', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_WITH_SCOPE, 'S046');
    expect(scope).toContain('src/sprint/');
    expect(scope).toContain('__tests__/sprint/');
  });

  it('should parse scope for different story', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_WITH_SCOPE, 'S047');
    expect(scope).toContain('src/sprint/');
    expect(scope).toContain('src/coordination/');
  });

  it('should return empty array when story has no scope column', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_WITH_SCOPE, 'S048');
    expect(scope).toHaveLength(0);
  });

  it('should return empty array when story not found', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_WITH_SCOPE, 'S999');
    expect(scope).toHaveLength(0);
  });

  it('should return empty array for SPRINT.md with no scope columns', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_NO_SCOPE, 'S046');
    expect(scope).toHaveLength(0);
  });

  it('should be case-insensitive for story ID', () => {
    const scope = parseScopeFromSprintMd(SPRINT_MD_WITH_SCOPE, 's046');
    expect(scope.length).toBeGreaterThan(0);
  });

  it('should support Scope: inline annotation', () => {
    const content = `
## S200 — Feature description
Scope: src/special/, docs/
`;
    const scope = parseScopeFromSprintMd(content, 'S200');
    expect(scope).toContain('src/special/');
    expect(scope).toContain('docs/');
  });
});

// ============================================================================
// fileMatchesScope
// ============================================================================

describe('fileMatchesScope', () => {
  it('should match file under directory prefix', () => {
    expect(fileMatchesScope('src/sprint/index.ts', 'src/sprint/')).toBe(true);
  });

  it('should match deeply nested file under directory prefix', () => {
    expect(fileMatchesScope('src/sprint/validation/story.ts', 'src/sprint/')).toBe(true);
  });

  it('should not match file in sibling directory', () => {
    expect(fileMatchesScope('src/coordination/index.ts', 'src/sprint/')).toBe(false);
  });

  it('should match exact file path', () => {
    expect(fileMatchesScope('action.yml', 'action.yml')).toBe(true);
  });

  it('should not match different exact file', () => {
    expect(fileMatchesScope('other.yml', 'action.yml')).toBe(false);
  });

  it('should match extension wildcard *.ts', () => {
    expect(fileMatchesScope('src/auth.ts', '*.ts')).toBe(true);
    expect(fileMatchesScope('src/auth.js', '*.ts')).toBe(false);
  });

  it('should match glob pattern src/*.ts for files in the directory', () => {
    expect(fileMatchesScope('src/auth.ts', 'src/*.ts')).toBe(true);
  });

  it('should match extension-only glob pattern for any path', () => {
    // src/*.ts uses startsWith(dir) + endsWith(glob) which matches nested paths too
    expect(fileMatchesScope('src/nested/auth.ts', 'src/*.ts')).toBe(true);
  });

  it('should match file prefix', () => {
    expect(fileMatchesScope('src/sprint/index.ts', 'src/sprint')).toBe(true);
  });
});

// ============================================================================
// isAlwaysAllowed
// ============================================================================

describe('isAlwaysAllowed', () => {
  it('should allow package.json', () => {
    expect(isAlwaysAllowed('package.json')).toBe(true);
  });

  it('should allow package-lock.json', () => {
    expect(isAlwaysAllowed('package-lock.json')).toBe(true);
  });

  it('should allow tsconfig.json', () => {
    expect(isAlwaysAllowed('tsconfig.json')).toBe(true);
  });

  it('should allow tsconfig.test.json', () => {
    expect(isAlwaysAllowed('tsconfig.test.json')).toBe(true);
  });

  it('should allow .github/ files', () => {
    expect(isAlwaysAllowed('.github/workflows/ci.yml')).toBe(true);
  });

  it('should allow README files', () => {
    expect(isAlwaysAllowed('README.md')).toBe(true);
  });

  it('should allow CHANGELOG files', () => {
    expect(isAlwaysAllowed('CHANGELOG.md')).toBe(true);
  });

  it('should not allow regular source files', () => {
    expect(isAlwaysAllowed('src/auth.ts')).toBe(false);
  });

  it('should not allow arbitrary files', () => {
    expect(isAlwaysAllowed('src/components/Button.tsx')).toBe(false);
  });

  it('should support extra patterns', () => {
    const extra = [/^custom-always-allowed/];
    expect(isAlwaysAllowed('custom-always-allowed/file.ts', extra)).toBe(true);
  });
});

// ============================================================================
// detectScopeCreep
// ============================================================================

describe('detectScopeCreep', () => {
  it('should skip when branch has no story ID', () => {
    const options = createDefaultOptions(['src/auth.ts'], 'main');
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(false);
    expect(result.storyId).toBeNull();
    expect(result.message).toContain('skipped');
  });

  it('should skip when story has no declared scope', () => {
    const options = createDefaultOptions(['src/auth.ts'], 'S048-no-scope');
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(false);
    expect(result.declaredScope).toHaveLength(0);
    expect(result.message).toContain('skipped');
  });

  it('should return no scope creep when all files are in scope', () => {
    const options = createDefaultOptions(
      ['src/sprint/index.ts', 'src/sprint/validation.ts', '__tests__/sprint/story.test.ts'],
      'S046-story-id'
    );
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(false);
    expect(result.inScopeFiles).toHaveLength(3);
    expect(result.outOfScopeFiles).toHaveLength(0);
  });

  it('should detect scope creep when file is outside declared scope', () => {
    const options = createDefaultOptions(
      ['src/sprint/index.ts', 'src/coordination/concurrent-prs.ts'],
      'S046-story-id'
    );
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(true);
    expect(result.outOfScopeFiles).toHaveLength(1);
    expect(result.outOfScopeFiles[0].path).toBe('src/coordination/concurrent-prs.ts');
  });

  it('should allow always-allowed files even when outside scope', () => {
    const options = createDefaultOptions(
      ['src/sprint/index.ts', 'package.json', 'tsconfig.json'],
      'S046-story-id'
    );
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(false);
    expect(result.inScopeFiles).toContain('package.json');
    expect(result.inScopeFiles).toContain('tsconfig.json');
  });

  it('should extract story ID from be-S### branch naming', () => {
    const options = createDefaultOptions(['src/sprint/index.ts'], 'be-S046-story-id');
    const result = detectScopeCreep(options);

    expect(result.storyId).toBe('S046');
    expect(result.hasScopeCreep).toBe(false);
  });

  it('should include declared scope in result', () => {
    const options = createDefaultOptions(['src/sprint/index.ts'], 'S046-story-id');
    const result = detectScopeCreep(options);

    expect(result.declaredScope).toContain('src/sprint/');
    expect(result.declaredScope).toContain('__tests__/sprint/');
  });

  it('should include message with scope details when creep detected', () => {
    const options = createDefaultOptions(
      ['src/sprint/index.ts', 'src/llm/review.ts'],
      'S046-story-id'
    );
    const result = detectScopeCreep(options);

    expect(result.message).toContain('S046');
    expect(result.message).toContain('scope');
  });

  it('should detect multiple out-of-scope files', () => {
    const options = createDefaultOptions(
      ['src/coordination/index.ts', 'src/llm/review.ts', 'src/gates/gate.ts'],
      'S046-story-id'
    );
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(true);
    expect(result.outOfScopeFiles).toHaveLength(3);
  });

  it('should skip check when SPRINT.md has no scope columns', () => {
    const options = createDefaultOptions(
      ['src/auth.ts'],
      'S046-story-id',
      SPRINT_MD_NO_SCOPE
    );
    const result = detectScopeCreep(options);

    expect(result.hasScopeCreep).toBe(false);
    expect(result.declaredScope).toHaveLength(0);
  });
});

// ============================================================================
// formatScopeCreepWarning
// ============================================================================

describe('formatScopeCreepWarning', () => {
  function makeResult(overrides: Partial<ScopeCreepResult> = {}): ScopeCreepResult {
    return {
      hasScopeCreep: true,
      outOfScopeFiles: [
        { path: 'src/llm/review.ts', reason: 'Not in scope' },
        { path: 'src/coordination/index.ts', reason: 'Not in scope' },
      ],
      inScopeFiles: ['src/sprint/index.ts'],
      declaredScope: ['src/sprint/', '__tests__/sprint/'],
      storyId: 'S046',
      message: 'Scope creep detected',
      ...overrides,
    };
  }

  it('should return empty string when no scope creep', () => {
    const result = makeResult({ hasScopeCreep: false, outOfScopeFiles: [] });
    expect(formatScopeCreepWarning(result)).toBe('');
  });

  it('should include Scope Creep header', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('Scope Creep');
  });

  it('should include story ID in header', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('S046');
  });

  it('should include out-of-scope file paths', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('src/llm/review.ts');
    expect(output).toContain('src/coordination/index.ts');
  });

  it('should include declared scope patterns', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('src/sprint/');
    expect(output).toContain('__tests__/sprint/');
  });

  it('should note this is a WARN, not blocking', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('WARN');
    expect(output).toContain('not blocking');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include options section', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('Options');
  });

  it('should truncate when many out-of-scope files', () => {
    const manyFiles = Array.from({ length: 15 }, (_, i) => ({
      path: `src/out-of-scope/file-${i}.ts`,
      reason: 'Not in scope',
    }));
    const result = makeResult({ outOfScopeFiles: manyFiles });
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('more');
  });

  it('should include file count in summary', () => {
    const result = makeResult();
    const output = formatScopeCreepWarning(result);
    expect(output).toContain('2'); // 2 out-of-scope files
  });
});
