/**
 * Tests for Story ID Validation (S046)
 */

import {
  extractStoryIdFromBranch,
  normalizeStatus,
  parseSprintMd,
  findStoryById,
  validateStoryId,
  formatStoryValidationFinding,
  BRANCH_STORY_ID_PATTERN,
  type StoryValidationResult,
  type StoryValidationOptions,
  type SprintStory,
} from '../../src/sprint/story-id-validation';

// ============================================================================
// Test helpers
// ============================================================================

const SAMPLE_SPRINT_MD = `
# Sprint Plan — Hawky

## Current Sprint

| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S046 | Story ID Validation | Luna | in-progress |
| S047 | Sprint Status on PR Open | Luna | backlog |
| S048 | Sprint Status on Merge | Luna | backlog |
| S049 | Activity Logging | Luna | done |
| S050 | Notifications Routing | Luna | blocked |
| S051 | Scope Creep Detection | Luna | review |

## Backlog

| Story | Description | Owner | Status |
|-------|-------------|-------|--------|
| S100 | Future story | Kai | backlog |
`;

function createDefaultOptions(
  branchName: string,
  sprintMdContent: string = SAMPLE_SPRINT_MD,
  overrides: Partial<StoryValidationOptions> = {}
): StoryValidationOptions {
  return {
    branchName,
    sprintMdContent,
    ...overrides,
  };
}

// ============================================================================
// extractStoryIdFromBranch
// ============================================================================

describe('extractStoryIdFromBranch', () => {
  it('should extract S### from plain story branch', () => {
    expect(extractStoryIdFromBranch('S046')).toBe('S046');
  });

  it('should extract S### from branch with description suffix', () => {
    expect(extractStoryIdFromBranch('S046-story-id-validation')).toBe('S046');
  });

  it('should extract S### from branch with domain prefix', () => {
    expect(extractStoryIdFromBranch('be-S046-story-id-validation')).toBe('S046');
  });

  it('should extract S### from branch with slash separator', () => {
    expect(extractStoryIdFromBranch('luna/S046-story-id-validation')).toBe('S046');
  });

  it('should extract S### from sprint branch naming', () => {
    expect(extractStoryIdFromBranch('luna/sprint8')).toBeNull(); // sprint8 is not S###
  });

  it('should extract 4-digit story IDs', () => {
    expect(extractStoryIdFromBranch('S1001-big-story')).toBe('S1001');
  });

  it('should normalize lowercase s prefix to uppercase', () => {
    expect(extractStoryIdFromBranch('s046-lowercase')).toBe('S046');
  });

  it('should return null for branch with no story ID', () => {
    expect(extractStoryIdFromBranch('main')).toBeNull();
  });

  it('should return null for feature branches without story IDs', () => {
    expect(extractStoryIdFromBranch('feature/add-auth')).toBeNull();
  });

  it('should return null for branches with short S-patterns', () => {
    // S## (2 digits) should not match — must be 3+ digits
    expect(extractStoryIdFromBranch('S04-short')).toBeNull();
  });

  it('should handle underscore separators', () => {
    expect(extractStoryIdFromBranch('be_S046_auth')).toBe('S046');
  });
});

// ============================================================================
// normalizeStatus
// ============================================================================

describe('normalizeStatus', () => {
  it('should normalize "done" to done', () => {
    expect(normalizeStatus('done')).toBe('done');
  });

  it('should normalize "completed" to done', () => {
    expect(normalizeStatus('completed')).toBe('done');
  });

  it('should normalize "merged" to done', () => {
    expect(normalizeStatus('merged')).toBe('done');
  });

  it('should normalize "shipped" to done', () => {
    expect(normalizeStatus('shipped')).toBe('done');
  });

  it('should normalize "in-progress" to in-progress', () => {
    expect(normalizeStatus('in-progress')).toBe('in-progress');
  });

  it('should normalize "WIP" to in-progress', () => {
    expect(normalizeStatus('WIP')).toBe('in-progress');
  });

  it('should normalize "review" to review', () => {
    expect(normalizeStatus('review')).toBe('review');
  });

  it('should normalize "sprint:review" to review', () => {
    expect(normalizeStatus('sprint:review')).toBe('review');
  });

  it('should normalize "blocked" to blocked', () => {
    expect(normalizeStatus('blocked')).toBe('blocked');
  });

  it('should normalize "backlog" to backlog', () => {
    expect(normalizeStatus('backlog')).toBe('backlog');
  });

  it('should normalize unknown strings to unknown', () => {
    expect(normalizeStatus('some-weird-status')).toBe('unknown');
  });

  it('should be case-insensitive', () => {
    expect(normalizeStatus('DONE')).toBe('done');
    expect(normalizeStatus('In-Progress')).toBe('in-progress');
  });

  it('should trim whitespace', () => {
    expect(normalizeStatus('  done  ')).toBe('done');
  });
});

// ============================================================================
// parseSprintMd
// ============================================================================

describe('parseSprintMd', () => {
  it('should parse all stories from SPRINT.md', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    expect(stories.length).toBeGreaterThanOrEqual(7); // S046-S051, S100
  });

  it('should parse story ID correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s046 = stories.find((s) => s.id === 'S046');
    expect(s046).toBeDefined();
    expect(s046!.id).toBe('S046');
  });

  it('should parse description correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s046 = stories.find((s) => s.id === 'S046');
    expect(s046!.description).toBe('Story ID Validation');
  });

  it('should parse owner correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s046 = stories.find((s) => s.id === 'S046');
    expect(s046!.owner).toBe('Luna');
  });

  it('should parse status correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s046 = stories.find((s) => s.id === 'S046');
    expect(s046!.status).toBe('in-progress');
  });

  it('should parse done status correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s049 = stories.find((s) => s.id === 'S049');
    expect(s049!.status).toBe('done');
  });

  it('should parse review status correctly', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s051 = stories.find((s) => s.id === 'S051');
    expect(s051!.status).toBe('review');
  });

  it('should handle multiple tables (current sprint + backlog)', () => {
    const stories = parseSprintMd(SAMPLE_SPRINT_MD);
    const s100 = stories.find((s) => s.id === 'S100');
    expect(s100).toBeDefined();
  });

  it('should return empty array for empty content', () => {
    expect(parseSprintMd('')).toHaveLength(0);
  });

  it('should return empty array when no table rows', () => {
    const content = `# Sprint Plan\n\nNo stories yet.`;
    expect(parseSprintMd(content)).toHaveLength(0);
  });

  it('should normalize story IDs to uppercase', () => {
    const content = `| s046 | test | Luna | backlog |`;
    const stories = parseSprintMd(content);
    expect(stories[0].id).toBe('S046');
  });
});

// ============================================================================
// findStoryById
// ============================================================================

describe('findStoryById', () => {
  const stories: SprintStory[] = [
    { id: 'S046', description: 'Test', owner: 'Luna', status: 'in-progress' },
    { id: 'S047', description: 'Other', owner: 'Kai', status: 'backlog' },
  ];

  it('should find a story by exact ID', () => {
    const story = findStoryById(stories, 'S046');
    expect(story?.id).toBe('S046');
  });

  it('should find a story case-insensitively', () => {
    const story = findStoryById(stories, 's046');
    expect(story?.id).toBe('S046');
  });

  it('should return null when story not found', () => {
    const story = findStoryById(stories, 'S999');
    expect(story).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(findStoryById([], 'S046')).toBeNull();
  });
});

// ============================================================================
// validateStoryId
// ============================================================================

describe('validateStoryId', () => {
  it('should skip validation for branch with no story ID', () => {
    const options = createDefaultOptions('main');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('skip');
    expect(result.hasBranchStoryId).toBe(false);
    expect(result.branchStoryId).toBeNull();
  });

  it('should return ok for valid story in in-progress state', () => {
    const options = createDefaultOptions('S046-story-id-validation');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('ok');
    expect(result.hasBranchStoryId).toBe(true);
    expect(result.branchStoryId).toBe('S046');
    expect(result.storyFound).toBe(true);
    expect(result.story?.status).toBe('in-progress');
  });

  it('should return ok for story in backlog state', () => {
    const options = createDefaultOptions('S047-sprint-status');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('ok');
    expect(result.story?.id).toBe('S047');
  });

  it('should block when story is done', () => {
    const options = createDefaultOptions('S049-activity-logging');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('block');
    expect(result.story?.status).toBe('done');
    expect(result.message).toContain('done');
  });

  it('should warn when story not found in SPRINT.md', () => {
    const options = createDefaultOptions('S999-mystery-story');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('warn');
    expect(result.storyFound).toBe(false);
    expect(result.branchStoryId).toBe('S999');
  });

  it('should not warn when warnOnMissing is false', () => {
    const options = createDefaultOptions('S999-mystery-story', SAMPLE_SPRINT_MD, {
      warnOnMissing: false,
    });
    const result = validateStoryId(options);

    expect(result.outcome).toBe('ok');
  });

  it('should use custom blockStatuses', () => {
    // 'review' is not blocked by default, but can be configured to block
    const options = createDefaultOptions('S051-scope-creep', SAMPLE_SPRINT_MD, {
      blockStatuses: ['done', 'review'],
    });
    const result = validateStoryId(options);

    expect(result.outcome).toBe('block');
  });

  it('should not block for review status by default', () => {
    const options = createDefaultOptions('S051-scope-creep');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('ok'); // review is ok by default
  });

  it('should work with be-S### branch naming', () => {
    const options = createDefaultOptions('be-S046-story-id');
    const result = validateStoryId(options);

    expect(result.outcome).toBe('ok');
    expect(result.branchStoryId).toBe('S046');
  });

  it('should include story details in result when found', () => {
    const options = createDefaultOptions('S046-story-id');
    const result = validateStoryId(options);

    expect(result.story).not.toBeNull();
    expect(result.story!.description).toBe('Story ID Validation');
    expect(result.story!.owner).toBe('Luna');
  });

  it('should include block-specific message for done story', () => {
    const options = createDefaultOptions('S049-done-story');
    const result = validateStoryId(options);

    expect(result.message).toContain('S049');
    expect(result.message).toContain('done');
  });

  it('should include story ID in warn message', () => {
    const options = createDefaultOptions('S999-unknown');
    const result = validateStoryId(options);

    expect(result.message).toContain('S999');
    expect(result.message).toContain('SPRINT.md');
  });
});

// ============================================================================
// formatStoryValidationFinding
// ============================================================================

describe('formatStoryValidationFinding', () => {
  function makeResult(overrides: Partial<StoryValidationResult> = {}): StoryValidationResult {
    return {
      hasBranchStoryId: true,
      branchStoryId: 'S999',
      storyFound: false,
      story: null,
      outcome: 'warn',
      message: 'Story S999 not found in SPRINT.md',
      ...overrides,
    };
  }

  it('should return empty string for ok outcome', () => {
    const result = makeResult({ outcome: 'ok' });
    expect(formatStoryValidationFinding(result)).toBe('');
  });

  it('should return empty string for skip outcome', () => {
    const result = makeResult({ outcome: 'skip', hasBranchStoryId: false });
    expect(formatStoryValidationFinding(result)).toBe('');
  });

  it('should format WARN output when story not found', () => {
    const result = makeResult({ outcome: 'warn' });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('Story Not Found');
    expect(output).toContain('S999');
    expect(output).toContain('WARN');
  });

  it('should format BLOCK output when story is done', () => {
    const result = makeResult({
      outcome: 'block',
      storyFound: true,
      story: { id: 'S049', description: 'Activity Logging', owner: 'Luna', status: 'done' },
      message: "Story S049 is already 'done'",
    });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('Story Already Completed');
    expect(output).toContain('BLOCK');
    expect(output).toContain('S049');
  });

  it('should include story details in BLOCK output', () => {
    const result = makeResult({
      outcome: 'block',
      storyFound: true,
      story: { id: 'S049', description: 'Activity Logging', owner: 'Luna', status: 'done' },
      message: "Story is done",
    });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('Activity Logging');
    expect(output).toContain('Luna');
    expect(output).toContain('done');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult({ outcome: 'warn' });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });

  it('should include What to check section in WARN output', () => {
    const result = makeResult({ outcome: 'warn' });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('What to check');
  });

  it('should include not blocking note in WARN output', () => {
    const result = makeResult({ outcome: 'warn' });
    const output = formatStoryValidationFinding(result);
    expect(output).toContain('not blocking');
  });
});
