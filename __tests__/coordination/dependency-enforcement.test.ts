/**
 * Tests for Dependency Enforcement (S041)
 */

import {
  extractCurrentStoryId,
  parseDependencies,
  checkStoryMerged,
  enforceDependencies,
  formatDependencyBlock,
  type DependencyOctokitLike,
  type DependencyEnforcementOptions,
  type DependencyEnforcementResult,
} from '../../src/coordination/dependency-enforcement';

// ============================================================================
// Test data
// ============================================================================

const SPRINT_MD_WITH_DEPS = `
# Sprint Plan

## Current Sprint

| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S046 | Story ID Validation | Luna | in-progress |
| S047 | Sprint Status PR Open | Luna | backlog |
| S048 | Sprint Status Merge | Luna | backlog |
| S100 | Complex Story | Kai | backlog |

## Story Details

### S047
Description: Sprint status labeling on PR open.
Depends on S046, S100

### S048
Blockers: S047

### S100
No dependencies.
`;

const SPRINT_MD_NO_DEPS = `
| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S046 | Story ID Validation | Luna | in-progress |
`;

// ============================================================================
// Mock helpers
// ============================================================================

type MockPR = {
  number: number;
  title: string;
  head: { ref: string };
  base: { ref: string };
  merged_at: string | null;
};

function createMockOctokit(closedPRs: MockPR[]): DependencyOctokitLike {
  return {
    rest: {
      pulls: {
        list: jest.fn().mockResolvedValue({ data: closedPRs }),
      },
    },
  };
}

function createMockPR(
  number: number,
  headRef: string,
  mergedAt: string | null
): MockPR {
  return {
    number,
    title: `PR ${number}`,
    head: { ref: headRef },
    base: { ref: 'dev' },
    merged_at: mergedAt,
  };
}

function createDefaultOptions(
  headBranch: string,
  sprintMdContent: string,
  octokit: DependencyOctokitLike,
  overrides: Partial<DependencyEnforcementOptions> = {}
): DependencyEnforcementOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    headBranch,
    baseBranch: 'dev',
    sprintMdContent,
    ...overrides,
  };
}

// ============================================================================
// extractCurrentStoryId
// ============================================================================

describe('extractCurrentStoryId', () => {
  it('should extract story ID from branch', () => {
    expect(extractCurrentStoryId('S047-sprint-status')).toBe('S047');
  });

  it('should extract from be-S### branch', () => {
    expect(extractCurrentStoryId('be-S047-sprint')).toBe('S047');
  });

  it('should return null for branches without story ID', () => {
    expect(extractCurrentStoryId('main')).toBeNull();
  });

  it('should normalize to uppercase', () => {
    expect(extractCurrentStoryId('s047')).toBe('S047');
  });
});

// ============================================================================
// parseDependencies
// ============================================================================

describe('parseDependencies', () => {
  it('should parse "Depends on S###, S###" pattern', () => {
    const deps = parseDependencies(SPRINT_MD_WITH_DEPS, 'S047');
    expect(deps).toContain('S046');
    expect(deps).toContain('S100');
  });

  it('should parse "Blockers: S###" pattern', () => {
    const deps = parseDependencies(SPRINT_MD_WITH_DEPS, 'S048');
    expect(deps).toContain('S047');
  });

  it('should return empty array when no dependencies declared', () => {
    const deps = parseDependencies(SPRINT_MD_WITH_DEPS, 'S046');
    expect(deps).toHaveLength(0);
  });

  it('should return empty array for story not found', () => {
    const deps = parseDependencies(SPRINT_MD_WITH_DEPS, 'S999');
    expect(deps).toHaveLength(0);
  });

  it('should return empty array for SPRINT.md with no dependency declarations', () => {
    const deps = parseDependencies(SPRINT_MD_NO_DEPS, 'S046');
    expect(deps).toHaveLength(0);
  });

  it('should not include self as dependency', () => {
    const content = `
### S047
Depends on S047
`;
    const deps = parseDependencies(content, 'S047');
    expect(deps).not.toContain('S047');
  });

  it('should deduplicate dependencies', () => {
    const content = `
### S047
Depends on S046
Blockers: S046
`;
    const deps = parseDependencies(content, 'S047');
    const s046Count = deps.filter((d) => d === 'S046').length;
    expect(s046Count).toBe(1);
  });
});

// ============================================================================
// checkStoryMerged
// ============================================================================

describe('checkStoryMerged', () => {
  it('should return merged: true when story branch was merged', async () => {
    const closedPRs = [
      createMockPR(10, 'S046-story-id-validation', '2026-03-01T10:00:00Z'),
    ];
    const octokit = createMockOctokit(closedPRs);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(true);
    expect(result.prNumber).toBe(10);
  });

  it('should return merged: false when no matching merged PR found', async () => {
    const closedPRs = [
      createMockPR(10, 'S099-some-other-story', '2026-03-01T10:00:00Z'),
    ];
    const octokit = createMockOctokit(closedPRs);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(false);
    expect(result.prNumber).toBeNull();
  });

  it('should return merged: false when PR is closed but not merged', async () => {
    const closedPRs = [
      createMockPR(10, 'S046-story-id', null), // merged_at is null = closed not merged
    ];
    const octokit = createMockOctokit(closedPRs);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(false);
  });

  it('should find story ID in branch with prefix', async () => {
    const closedPRs = [
      createMockPR(10, 'be-S046-story', '2026-03-01T10:00:00Z'),
    ];
    const octokit = createMockOctokit(closedPRs);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(true);
  });

  it('should be case-insensitive for story ID matching', async () => {
    const closedPRs = [
      createMockPR(10, 's046-lowercase', '2026-03-01T10:00:00Z'),
    ];
    const octokit = createMockOctokit(closedPRs);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(true);
  });

  it('should return empty list context gracefully', async () => {
    const octokit = createMockOctokit([]);
    const result = await checkStoryMerged(octokit, 'owner', 'repo', 'S046', 'dev');

    expect(result.merged).toBe(false);
  });
});

// ============================================================================
// enforceDependencies
// ============================================================================

describe('enforceDependencies', () => {
  it('should skip when branch has no story ID', async () => {
    const octokit = createMockOctokit([]);
    const options = createDefaultOptions('main', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.hasUnmetDependencies).toBe(false);
    expect(result.storyId).toBeNull();
    expect(result.message).toContain('skipped');
  });

  it('should skip when story has no dependencies', async () => {
    const octokit = createMockOctokit([]);
    const options = createDefaultOptions('S046-story-id', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.hasUnmetDependencies).toBe(false);
    expect(result.allDependencies).toHaveLength(0);
    expect(result.message).toContain('no declared dependencies');
  });

  it('should detect unmet dependency', async () => {
    const octokit = createMockOctokit([]); // no merged PRs
    const options = createDefaultOptions('S047-sprint-status', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.hasUnmetDependencies).toBe(true);
    expect(result.unmetDependencies.some((d) => d.storyId === 'S046')).toBe(true);
    expect(result.unmetDependencies.some((d) => d.storyId === 'S100')).toBe(true);
  });

  it('should return satisfied when all dependencies are merged', async () => {
    const closedPRs = [
      createMockPR(10, 'S046-story-id', '2026-03-01T10:00:00Z'),
      createMockPR(11, 'S100-complex', '2026-03-01T11:00:00Z'),
    ];
    const octokit = createMockOctokit(closedPRs);
    const options = createDefaultOptions('S047-sprint-status', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.hasUnmetDependencies).toBe(false);
    expect(result.metDependencies).toHaveLength(2);
  });

  it('should return partial when some dependencies are met', async () => {
    const closedPRs = [
      createMockPR(10, 'S046-story-id', '2026-03-01T10:00:00Z'), // S046 merged
      // S100 not merged
    ];
    const octokit = createMockOctokit(closedPRs);
    const options = createDefaultOptions('S047-sprint-status', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.hasUnmetDependencies).toBe(true);
    expect(result.unmetDependencies.some((d) => d.storyId === 'S100')).toBe(true);
    expect(result.metDependencies.some((d) => d.storyId === 'S046')).toBe(true);
  });

  it('should include story ID in result', async () => {
    const octokit = createMockOctokit([]);
    const options = createDefaultOptions('S047-sprint', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    expect(result.storyId).toBe('S047');
  });

  it('should handle API errors gracefully', async () => {
    const octokit: DependencyOctokitLike = {
      rest: {
        pulls: {
          list: jest.fn().mockRejectedValue(new Error('API unavailable')),
        },
      },
    };
    const options = createDefaultOptions('S047-sprint', SPRINT_MD_WITH_DEPS, octokit);
    const result = await enforceDependencies(options);

    // Should not throw, mark deps as unmet
    expect(result.hasUnmetDependencies).toBe(true);
  });
});

// ============================================================================
// formatDependencyBlock
// ============================================================================

describe('formatDependencyBlock', () => {
  function makeResult(overrides: Partial<DependencyEnforcementResult> = {}): DependencyEnforcementResult {
    return {
      hasUnmetDependencies: true,
      unmetDependencies: [
        { storyId: 'S046', reason: 'Not merged into dev', storyFound: false },
      ],
      metDependencies: [],
      allDependencies: ['S046'],
      storyId: 'S047',
      message: 'Unmet dependencies: S046',
      ...overrides,
    };
  }

  it('should return empty string when no unmet dependencies', () => {
    const result = makeResult({ hasUnmetDependencies: false, unmetDependencies: [] });
    expect(formatDependencyBlock(result)).toBe('');
  });

  it('should include BLOCK header', () => {
    const result = makeResult();
    const output = formatDependencyBlock(result);
    expect(output).toContain('Unmet Dependencies');
    expect(output).toContain('BLOCK');
  });

  it('should list unmet dependency IDs', () => {
    const result = makeResult();
    const output = formatDependencyBlock(result);
    expect(output).toContain('S046');
  });

  it('should include met dependencies when some are satisfied', () => {
    const result = makeResult({
      metDependencies: [{ storyId: 'S045', mergedPRNumber: 99 }],
      allDependencies: ['S045', 'S046'],
    });
    const output = formatDependencyBlock(result);
    expect(output).toContain('S045');
    expect(output).toContain('#99');
  });

  it('should include next steps', () => {
    const result = makeResult();
    const output = formatDependencyBlock(result);
    expect(output).toContain('Next steps');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatDependencyBlock(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include dependency count in header', () => {
    const result = makeResult({
      unmetDependencies: [
        { storyId: 'S046', reason: 'Not merged', storyFound: false },
        { storyId: 'S100', reason: 'Not merged', storyFound: false },
      ],
    });
    const output = formatDependencyBlock(result);
    expect(output).toContain('2');
  });
});
