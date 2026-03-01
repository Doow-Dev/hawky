/**
 * Tests for NOTIFICATIONS.md Routing (S050)
 */

import {
  filesMatchRoutingRule,
  formatNotificationEntry,
  routeNotifications,
  DEFAULT_ROUTING_RULES,
  type RoutingRule,
  type Notification,
  type NotificationRoutingOptions,
  type NotificationRoutingResult,
} from '../../src/sprint/notifications-routing';

// ============================================================================
// Test helpers
// ============================================================================

const TEST_DATE = '2026-03-01T10:00:00Z';

function createTestRule(recipient: string, patterns: RegExp[], tags: string[] = []): RoutingRule {
  return {
    name: `Test: ${recipient}`,
    recipient,
    patterns,
    reason: `${recipient} reason`,
    tags,
  };
}

function createDefaultOptions(
  changedFiles: string[],
  overrides: Partial<NotificationRoutingOptions> = {}
): NotificationRoutingOptions {
  return {
    prNumber: 42,
    prTitle: 'My test PR',
    prUrl: 'https://github.com/owner/repo/pull/42',
    changedFiles,
    event: 'opened',
    date: TEST_DATE,
    ...overrides,
  };
}

function createNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    recipient: '@Hawk',
    prNumber: 42,
    prTitle: 'My test PR',
    prUrl: 'https://github.com/owner/repo/pull/42',
    reason: 'Security review needed',
    event: 'opened',
    date: TEST_DATE,
    tags: ['security'],
    ...overrides,
  };
}

// ============================================================================
// filesMatchRoutingRule
// ============================================================================

describe('filesMatchRoutingRule', () => {
  it('should return matching files', () => {
    const rule = createTestRule('@Hawk', [/^src\/auth\//]);
    const files = ['src/auth/login.ts', 'src/api/users.ts'];
    const result = filesMatchRoutingRule(files, rule);
    expect(result).toEqual(['src/auth/login.ts']);
  });

  it('should return empty array when no files match', () => {
    const rule = createTestRule('@Hawk', [/^src\/auth\//]);
    const files = ['src/api/users.ts', 'README.md'];
    expect(filesMatchRoutingRule(files, rule)).toHaveLength(0);
  });

  it('should match files against any pattern in the rule', () => {
    const rule = createTestRule('@Hawk', [/^src\/auth\//, /\.env$/]);
    const files = ['src/api/users.ts', '.env', 'src/auth/login.ts'];
    const result = filesMatchRoutingRule(files, rule);
    expect(result).toHaveLength(2);
    expect(result).toContain('.env');
    expect(result).toContain('src/auth/login.ts');
  });

  it('should return empty for empty file list', () => {
    const rule = createTestRule('@Hawk', [/^src\/auth\//]);
    expect(filesMatchRoutingRule([], rule)).toHaveLength(0);
  });
});

// ============================================================================
// formatNotificationEntry
// ============================================================================

describe('formatNotificationEntry', () => {
  it('should include date in YYYY-MM-DD format', () => {
    const notification = createNotification({ date: '2026-03-01T10:00:00Z' });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('[2026-03-01]');
  });

  it('should include recipient', () => {
    const notification = createNotification({ recipient: '@Hawk' });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('@Hawk');
  });

  it('should include PR number', () => {
    const notification = createNotification({ prNumber: 42 });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('#42');
  });

  it('should include PR title', () => {
    const notification = createNotification({ prTitle: 'Add auth middleware' });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('Add auth middleware');
  });

  it('should include PR URL', () => {
    const notification = createNotification();
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('https://github.com/owner/repo/pull/42');
  });

  it('should include reason', () => {
    const notification = createNotification({ reason: 'Security review needed' });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('Security review needed');
  });

  it('should include tags when present', () => {
    const notification = createNotification({ tags: ['security', 'auth'] });
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('security');
    expect(entry).toContain('auth');
  });

  it('should not include empty tag brackets when no tags', () => {
    const notification = createNotification({ tags: [] });
    const entry = formatNotificationEntry(notification);
    // Should not have empty [] tag block
    expect(entry).not.toContain('[]');
  });

  it('should include [session:hawky-auto] marker', () => {
    const notification = createNotification();
    const entry = formatNotificationEntry(notification);
    expect(entry).toContain('[session:hawky-auto]');
  });
});

// ============================================================================
// routeNotifications — default rules
// ============================================================================

describe('routeNotifications — default rules', () => {
  it('should route auth files to @Hawk', () => {
    const options = createDefaultOptions(['src/auth/login.ts']);
    const result = routeNotifications(options);

    const hawkNotif = result.notifications.find((n) => n.recipient === '@Hawk');
    expect(hawkNotif).toBeDefined();
    expect(hawkNotif!.tags).toContain('security');
  });

  it('should route API files to @Kai', () => {
    const options = createDefaultOptions(['src/api/users.ts']);
    const result = routeNotifications(options);

    const kaiNotif = result.notifications.find((n) => n.recipient === '@Kai');
    expect(kaiNotif).toBeDefined();
    expect(kaiNotif!.tags).toContain('api');
  });

  it('should route openapi.yaml to @Kai', () => {
    const options = createDefaultOptions(['openapi.yaml']);
    const result = routeNotifications(options);

    const kaiNotif = result.notifications.find((n) => n.recipient === '@Kai');
    expect(kaiNotif).toBeDefined();
  });

  it('should route frontend components to @Nova', () => {
    const options = createDefaultOptions(['src/components/Button.tsx']);
    const result = routeNotifications(options);

    const novaNotif = result.notifications.find((n) => n.recipient === '@Nova');
    expect(novaNotif).toBeDefined();
    expect(novaNotif!.tags).toContain('design');
  });

  it('should route migration files to @Luna', () => {
    const options = createDefaultOptions(['migrations/001_create_users.sql']);
    const result = routeNotifications(options);

    const lunaNotif = result.notifications.find((n) => n.recipient === '@Luna');
    expect(lunaNotif).toBeDefined();
    expect(lunaNotif!.tags).toContain('database');
  });

  it('should route to multiple recipients for mixed PRs', () => {
    const options = createDefaultOptions([
      'src/auth/login.ts',   // → @Hawk
      'src/api/users.ts',    // → @Kai
      'src/components/Form.tsx', // → @Nova
    ]);
    const result = routeNotifications(options);

    const recipients = result.notifications.map((n) => n.recipient);
    expect(recipients).toContain('@Hawk');
    expect(recipients).toContain('@Kai');
    expect(recipients).toContain('@Nova');
  });

  it('should not duplicate recipients when multiple files match same rule', () => {
    const options = createDefaultOptions([
      'src/auth/login.ts',
      'src/auth/token.ts',
      'src/auth/session.ts',
    ]);
    const result = routeNotifications(options);

    const hawkNotifs = result.notifications.filter((n) => n.recipient === '@Hawk');
    expect(hawkNotifs).toHaveLength(1);
  });

  it('should return no notifications for empty file list', () => {
    const options = createDefaultOptions([]);
    const result = routeNotifications(options);

    expect(result.hasNotifications).toBe(false);
    expect(result.notifications).toHaveLength(0);
  });

  it('should return no notifications for files matching no rules', () => {
    const options = createDefaultOptions(['README.md', 'package.json']);
    const result = routeNotifications(options);

    expect(result.hasNotifications).toBe(false);
  });
});

// ============================================================================
// routeNotifications — edge cases
// ============================================================================

describe('routeNotifications — edge cases', () => {
  it('should skip self-notification', () => {
    const customRules: RoutingRule[] = [
      createTestRule('@alice', [/^src\//]),
    ];
    const options = createDefaultOptions(['src/auth.ts'], {
      rules: customRules,
      authorLogin: 'alice',
    });
    const result = routeNotifications(options);

    // @alice should not receive notification about their own PR
    expect(result.notifications.find((n) => n.recipient === '@alice')).toBeUndefined();
  });

  it('should not skip notification when authorLogin does not match recipient', () => {
    const options = createDefaultOptions(['src/auth/login.ts'], {
      authorLogin: 'bob', // not hawk
    });
    const result = routeNotifications(options);

    const hawkNotif = result.notifications.find((n) => n.recipient === '@Hawk');
    expect(hawkNotif).toBeDefined();
  });

  it('should combine reasons when multiple rules match same recipient', () => {
    const customRules: RoutingRule[] = [
      { name: 'Rule A', recipient: '@Hawk', patterns: [/^src\/auth\//], reason: 'Auth change', tags: ['auth'] },
      { name: 'Rule B', recipient: '@Hawk', patterns: [/\.env$/], reason: 'Env file change', tags: ['security'] },
    ];
    const options = createDefaultOptions(['src/auth/login.ts', '.env'], {
      rules: customRules,
    });
    const result = routeNotifications(options);

    const hawkNotif = result.notifications.find((n) => n.recipient === '@Hawk');
    expect(hawkNotif!.reason).toContain('Auth change');
    expect(hawkNotif!.reason).toContain('Env file change');
  });

  it('should combine tags from multiple matching rules for same recipient', () => {
    const customRules: RoutingRule[] = [
      { name: 'Rule A', recipient: '@Hawk', patterns: [/^src\/auth\//], reason: 'A', tags: ['auth'] },
      { name: 'Rule B', recipient: '@Hawk', patterns: [/\.env$/], reason: 'B', tags: ['security'] },
    ];
    const options = createDefaultOptions(['src/auth/login.ts', '.env'], {
      rules: customRules,
    });
    const result = routeNotifications(options);

    const hawkNotif = result.notifications.find((n) => n.recipient === '@Hawk');
    expect(hawkNotif!.tags).toContain('auth');
    expect(hawkNotif!.tags).toContain('security');
  });

  it('should generate formatted entries', () => {
    const options = createDefaultOptions(['src/auth/login.ts']);
    const result = routeNotifications(options);

    expect(result.entries).toHaveLength(result.notifications.length);
    expect(result.entries[0]).toContain('@Hawk');
  });

  it('should support custom routing rules', () => {
    const customRules: RoutingRule[] = [
      createTestRule('@CustomAgent', [/^custom\//], ['custom']),
    ];
    const options = createDefaultOptions(['custom/file.ts'], { rules: customRules });
    const result = routeNotifications(options);

    expect(result.notifications[0].recipient).toBe('@CustomAgent');
  });

  it('should include event type in notification', () => {
    const options = createDefaultOptions(['src/auth/login.ts'], { event: 'merged' });
    const result = routeNotifications(options);

    expect(result.notifications[0].event).toBe('merged');
  });

  it('should include message with recipients', () => {
    const options = createDefaultOptions(['src/auth/login.ts']);
    const result = routeNotifications(options);

    expect(result.message).toContain('#42');
    expect(result.message).toContain('@Hawk');
  });
});
