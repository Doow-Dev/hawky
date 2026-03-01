/**
 * Tests for Session Handoff Notification (S042)
 */

import {
  anyFileMatches,
  generateHandoffNotifications,
  API_CHANGE_PATTERNS,
  SCHEMA_CHANGE_PATTERNS,
  AUTH_CHANGE_PATTERNS,
  type HandoffOptions,
  type HandoffResult,
} from '../../src/coordination/session-handoff';

// ============================================================================
// Test helpers
// ============================================================================

function createDefaultOptions(
  changedFiles: string[],
  overrides: Partial<HandoffOptions> = {}
): HandoffOptions {
  return {
    prNumber: 42,
    prTitle: 'Add API endpoint',
    prUrl: 'https://github.com/owner/repo/pull/42',
    authorLogin: 'luna',
    headBranch: 'S046-api-endpoint',
    baseBranch: 'dev',
    changedFiles,
    labels: [],
    date: '2026-03-01T10:00:00.000Z',
    projectName: 'hawky',
    sessionId: 'test-session',
    ...overrides,
  };
}

// ============================================================================
// anyFileMatches
// ============================================================================

describe('anyFileMatches', () => {
  it('should return matching files', () => {
    const files = ['src/api/users.ts', 'src/auth/login.ts', 'README.md'];
    const result = anyFileMatches(files, [/^src\/api\//]);
    expect(result).toEqual(['src/api/users.ts']);
  });

  it('should return empty when no matches', () => {
    const files = ['README.md', 'package.json'];
    expect(anyFileMatches(files, [/^src\/api\//])).toHaveLength(0);
  });

  it('should return empty for empty file list', () => {
    expect(anyFileMatches([], API_CHANGE_PATTERNS)).toHaveLength(0);
  });

  it('should match multiple patterns', () => {
    const files = ['src/api/users.ts', 'openapi.yaml'];
    const result = anyFileMatches(files, [/^src\/api\//, /openapi/i]);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// API_CHANGE_PATTERNS
// ============================================================================

describe('API_CHANGE_PATTERNS', () => {
  it('should match src/api/ files', () => {
    expect(anyFileMatches(['src/api/users.ts'], API_CHANGE_PATTERNS)).toHaveLength(1);
  });

  it('should match src/routes/ files', () => {
    expect(anyFileMatches(['src/routes/index.ts'], API_CHANGE_PATTERNS)).toHaveLength(1);
  });

  it('should match openapi.yaml', () => {
    expect(anyFileMatches(['openapi.yaml'], API_CHANGE_PATTERNS)).toHaveLength(1);
  });

  it('should match swagger.json', () => {
    expect(anyFileMatches(['swagger.json'], API_CHANGE_PATTERNS)).toHaveLength(1);
  });

  it('should not match regular source files', () => {
    expect(anyFileMatches(['src/auth/login.ts'], API_CHANGE_PATTERNS)).toHaveLength(0);
  });
});

// ============================================================================
// generateHandoffNotifications
// ============================================================================

describe('generateHandoffNotifications', () => {
  it('should return no handoffs when no downstream-impact files changed', () => {
    const options = createDefaultOptions(['README.md', 'package.json']);
    const result = generateHandoffNotifications(options);

    expect(result.hasHandoffs).toBe(false);
    expect(result.notifications).toHaveLength(0);
  });

  it('should return no handoffs for empty file list', () => {
    const options = createDefaultOptions([]);
    const result = generateHandoffNotifications(options);

    expect(result.hasHandoffs).toBe(false);
  });

  it('should notify @Nova for API changes', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = generateHandoffNotifications(options);

    const novaNotif = result.notifications.find((n) => n.recipient === '@Nova');
    expect(novaNotif).toBeDefined();
    expect(novaNotif!.tags).toContain('api');
  });

  it('should notify @Nova for openapi.yaml changes', () => {
    const options = createDefaultOptions(['openapi.yaml']);
    const result = generateHandoffNotifications(options);

    expect(result.notifications.some((n) => n.recipient === '@Nova')).toBe(true);
  });

  it('should notify @Nova and @Latch for schema changes', () => {
    const options = createDefaultOptions(['schema.graphql']);
    const result = generateHandoffNotifications(options);

    const recipients = result.notifications.map((n) => n.recipient);
    expect(recipients).toContain('@Nova');
    expect(recipients).toContain('@Latch');
  });

  it('should notify @Nova and @Latch for prisma schema changes', () => {
    const options = createDefaultOptions(['prisma/schema.prisma']);
    const result = generateHandoffNotifications(options);

    const recipients = result.notifications.map((n) => n.recipient);
    expect(recipients).toContain('@Nova');
    expect(recipients).toContain('@Latch');
  });

  it('should notify @Kai for auth changes', () => {
    const options = createDefaultOptions(['src/auth/login.ts']);
    const result = generateHandoffNotifications(options);

    const kaiNotif = result.notifications.find((n) => n.recipient === '@Kai');
    expect(kaiNotif).toBeDefined();
    expect(kaiNotif!.tags).toContain('security');
  });

  it('should deduplicate notifications to same recipient', () => {
    // Both api and schema changes -> @Nova should only get one notification
    const options = createDefaultOptions(['src/api/users.ts', 'schema.graphql']);
    const result = generateHandoffNotifications(options);

    const novaNotifs = result.notifications.filter((n) => n.recipient === '@Nova');
    expect(novaNotifs).toHaveLength(1);
    // But it should have combined reasons
    expect(novaNotifs[0].reason).toContain('API');
  });

  it('should include PR number in notification reason', () => {
    const options = createDefaultOptions(['src/api/users.ts'], { prNumber: 99 });
    const result = generateHandoffNotifications(options);

    const notif = result.notifications.find((n) => n.recipient === '@Nova');
    expect(notif!.reason).toContain('#99');
  });

  it('should include story ID when branch has S### pattern', () => {
    const options = createDefaultOptions(['src/api/users.ts'], { headBranch: 'S046-api' });
    const result = generateHandoffNotifications(options);

    const notif = result.notifications.find((n) => n.recipient === '@Nova');
    expect(notif!.reason).toContain('S046');
  });

  it('should include PR URL in notification details', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = generateHandoffNotifications(options);

    const notif = result.notifications.find((n) => n.recipient === '@Nova');
    expect(notif!.details).toContain('https://github.com/owner/repo/pull/42');
  });

  it('should format entries for NOTIFICATIONS.md', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = generateHandoffNotifications(options);

    expect(result.entries).toHaveLength(result.notifications.length);
    expect(result.entries[0]).toContain('@Nova');
    expect(result.entries[0]).toContain('[2026-03-01]');
    expect(result.entries[0]).toContain('[session:test-session]');
  });

  it('should include author login in entry', () => {
    const options = createDefaultOptions(['src/api/users.ts'], { authorLogin: 'luna' });
    const result = generateHandoffNotifications(options);

    expect(result.entries[0]).toContain('@luna');
  });

  it('should include message summarizing recipients', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = generateHandoffNotifications(options);

    expect(result.message).toContain('@Nova');
    expect(result.message).toContain('handoff');
  });

  it('should handle multiple different downstream changes', () => {
    const options = createDefaultOptions([
      'src/api/users.ts',      // API → @Nova
      'src/auth/login.ts',     // Auth → @Kai
    ]);
    const result = generateHandoffNotifications(options);

    const recipients = result.notifications.map((n) => n.recipient);
    expect(recipients).toContain('@Nova');
    expect(recipients).toContain('@Kai');
  });

  it('should set hasHandoffs true when notifications generated', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = generateHandoffNotifications(options);

    expect(result.hasHandoffs).toBe(true);
  });

  it('should use default session ID when not provided', () => {
    const options = createDefaultOptions(['src/api/users.ts'], { sessionId: undefined });
    const result = generateHandoffNotifications(options);

    expect(result.entries[0]).toContain('[session:hawky-auto]');
  });
});
