/**
 * Tests for Sprint Status on PR Open/Merge (S047 + S048)
 */

import {
  extractStoryId,
  buildOpenPRComment,
  buildMergePRComment,
  applyPROpenedStatus,
  applyPRMergedStatus,
  SPRINT_LABEL_REVIEW,
  SPRINT_LABEL_DONE,
  type SprintStatusOctokitLike,
  type SprintStatusOpenOptions,
  type SprintStatusMergeOptions,
} from '../../src/sprint/pr-status';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockOctokit(): SprintStatusOctokitLike & {
  calls: { addLabels: unknown[]; removeLabel: unknown[]; createComment: unknown[] };
} {
  const calls = {
    addLabels: [] as unknown[],
    removeLabel: [] as unknown[],
    createComment: [] as unknown[],
  };

  return {
    calls,
    rest: {
      issues: {
        addLabels: jest.fn().mockImplementation((params) => {
          calls.addLabels.push(params);
          return Promise.resolve({ data: {} });
        }),
        removeLabel: jest.fn().mockImplementation((params) => {
          calls.removeLabel.push(params);
          return Promise.resolve({ data: {} });
        }),
        createComment: jest.fn().mockImplementation((params) => {
          calls.createComment.push(params);
          return Promise.resolve({ data: { id: 1, html_url: 'https://github.com/comment/1' } });
        }),
      },
    },
  };
}

function createOpenOptions(
  octokit: SprintStatusOctokitLike,
  overrides: Partial<SprintStatusOpenOptions> = {}
): SprintStatusOpenOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    prNumber: 42,
    prTitle: 'Add auth middleware',
    headBranch: 'S046-auth',
    authorLogin: 'luna',
    existingLabels: [],
    postComment: true,
    ...overrides,
  };
}

function createMergeOptions(
  octokit: SprintStatusOctokitLike,
  overrides: Partial<SprintStatusMergeOptions> = {}
): SprintStatusMergeOptions {
  return {
    octokit,
    owner: 'owner',
    repo: 'repo',
    prNumber: 42,
    prTitle: 'Add auth middleware',
    headBranch: 'S046-auth',
    authorLogin: 'luna',
    existingLabels: [],
    postComment: true,
    ...overrides,
  };
}

// ============================================================================
// extractStoryId
// ============================================================================

describe('extractStoryId', () => {
  it('should extract story ID from branch', () => {
    expect(extractStoryId('S046-auth-middleware')).toBe('S046');
  });

  it('should extract story ID from be-S### branch', () => {
    expect(extractStoryId('be-S046-auth')).toBe('S046');
  });

  it('should return null for branches without story ID', () => {
    expect(extractStoryId('main')).toBeNull();
    expect(extractStoryId('feature/random')).toBeNull();
  });
});

// ============================================================================
// buildOpenPRComment
// ============================================================================

describe('buildOpenPRComment', () => {
  it('should include PR number', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('#42');
  });

  it('should include PR title', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Add auth', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('Add auth');
  });

  it('should include author mention', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('@luna');
  });

  it('should include story ID reference when present', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: 'S046', authorLogin: 'luna' });
    expect(comment).toContain('S046');
  });

  it('should include sprint:review label name', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('sprint:review');
  });

  it('should include Hawky Sprint Status header', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('Hawky Sprint Status');
  });

  it('should mention review status', () => {
    const comment = buildOpenPRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment.toLowerCase()).toContain('review');
  });
});

// ============================================================================
// buildMergePRComment
// ============================================================================

describe('buildMergePRComment', () => {
  it('should include sprint:done label name', () => {
    const comment = buildMergePRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('sprint:done');
  });

  it('should include merged/done language', () => {
    const comment = buildMergePRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    const lower = comment.toLowerCase();
    expect(lower.includes('merged') || lower.includes('done')).toBe(true);
  });

  it('should include story ID when present', () => {
    const comment = buildMergePRComment({ prNumber: 42, prTitle: 'Test', storyId: 'S046', authorLogin: 'luna' });
    expect(comment).toContain('S046');
  });

  it('should include Hawky Sprint Status header', () => {
    const comment = buildMergePRComment({ prNumber: 42, prTitle: 'Test', storyId: null, authorLogin: 'luna' });
    expect(comment).toContain('Hawky Sprint Status');
  });
});

// ============================================================================
// applyPROpenedStatus
// ============================================================================

describe('applyPROpenedStatus', () => {
  it('should apply sprint:review label', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit);
    const result = await applyPROpenedStatus(options);

    expect(result.labelsApplied).toContain(SPRINT_LABEL_REVIEW);
    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: [SPRINT_LABEL_REVIEW] })
    );
  });

  it('should not add label if already present', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { existingLabels: [SPRINT_LABEL_REVIEW] });
    const result = await applyPROpenedStatus(options);

    expect(result.labelsApplied).not.toContain(SPRINT_LABEL_REVIEW);
    expect(octokit.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it('should post a comment when postComment is true', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { postComment: true });
    const result = await applyPROpenedStatus(options);

    expect(result.commentPosted).toBe(true);
    expect(octokit.rest.issues.createComment).toHaveBeenCalled();
  });

  it('should not post a comment when postComment is false', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { postComment: false });
    const result = await applyPROpenedStatus(options);

    expect(result.commentPosted).toBe(false);
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('should extract story ID from branch', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { headBranch: 'S046-auth' });
    const result = await applyPROpenedStatus(options);

    expect(result.storyId).toBe('S046');
  });

  it('should return null story ID for generic branches', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { headBranch: 'feature/random' });
    const result = await applyPROpenedStatus(options);

    expect(result.storyId).toBeNull();
  });

  it('should return success: true on completion', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit);
    const result = await applyPROpenedStatus(options);

    expect(result.success).toBe(true);
  });

  it('should include PR number in message', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { prNumber: 99 });
    const result = await applyPROpenedStatus(options);

    expect(result.message).toContain('99');
    expect(result.message).toContain('sprint:review');
  });

  it('should pass correct owner/repo/issue_number to GitHub API', async () => {
    const octokit = createMockOctokit();
    const options = createOpenOptions(octokit, { owner: 'myorg', repo: 'myrepo', prNumber: 77 });
    await applyPROpenedStatus(options);

    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'myorg', repo: 'myrepo', issue_number: 77 })
    );
  });
});

// ============================================================================
// applyPRMergedStatus
// ============================================================================

describe('applyPRMergedStatus', () => {
  it('should apply sprint:done label', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit);
    const result = await applyPRMergedStatus(options);

    expect(result.labelsApplied).toContain(SPRINT_LABEL_DONE);
    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith(
      expect.objectContaining({ labels: [SPRINT_LABEL_DONE] })
    );
  });

  it('should not add sprint:done if already present', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { existingLabels: [SPRINT_LABEL_DONE] });
    const result = await applyPRMergedStatus(options);

    expect(result.labelsApplied).not.toContain(SPRINT_LABEL_DONE);
  });

  it('should remove sprint:review label when present', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { existingLabels: [SPRINT_LABEL_REVIEW] });
    const result = await applyPRMergedStatus(options);

    expect(result.labelsRemoved).toContain(SPRINT_LABEL_REVIEW);
    expect(octokit.rest.issues.removeLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: SPRINT_LABEL_REVIEW })
    );
  });

  it('should not try to remove sprint:review when not present', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { existingLabels: [] });
    const result = await applyPRMergedStatus(options);

    expect(result.labelsRemoved).not.toContain(SPRINT_LABEL_REVIEW);
    expect(octokit.rest.issues.removeLabel).not.toHaveBeenCalled();
  });

  it('should post a comment when postComment is true', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { postComment: true });
    const result = await applyPRMergedStatus(options);

    expect(result.commentPosted).toBe(true);
    expect(result.commentBody).toContain('sprint:done');
  });

  it('should not post comment when postComment is false', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { postComment: false });
    const result = await applyPRMergedStatus(options);

    expect(result.commentPosted).toBe(false);
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('should extract story ID from branch', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit, { headBranch: 'S048-sprint-merge' });
    const result = await applyPRMergedStatus(options);

    expect(result.storyId).toBe('S048');
  });

  it('should return success: true on completion', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit);
    const result = await applyPRMergedStatus(options);

    expect(result.success).toBe(true);
  });

  it('should include sprint:done in message', async () => {
    const octokit = createMockOctokit();
    const options = createMergeOptions(octokit);
    const result = await applyPRMergedStatus(options);

    expect(result.message).toContain('sprint:done');
  });
});
