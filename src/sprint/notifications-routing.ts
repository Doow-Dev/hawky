/**
 * NOTIFICATIONS.md Routing (S050)
 *
 * Routes PR events to appropriate team members via NOTIFICATIONS.md.
 * Based on files changed and PR type:
 * - Auth/security changes → @Hawk (for security review)
 * - API changes → @Kai (technical PM confirmation)
 * - Design/frontend changes → @Nova (frontend review)
 * - Migrations → @Luna (backend)
 * - General PRs → @Hawk (default reviewer)
 *
 * Output: INFORM tier — generates notification entries to append
 * to NOTIFICATIONS.md (caller handles file write).
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A notification to route to a team member
 */
export interface Notification {
  /** The agent to notify (e.g., '@Hawk') */
  recipient: string;

  /** The PR number */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** PR URL */
  prUrl: string;

  /** Reason for the notification */
  reason: string;

  /** Event type that triggered this notification */
  event: 'opened' | 'merged' | 'reviewed' | 'closed';

  /** Date of the event (ISO string) */
  date: string;

  /** Context tags for routing (e.g., 'security', 'api', 'design') */
  tags: string[];
}

/**
 * A routing rule that maps file patterns to a recipient
 */
export interface RoutingRule {
  /** Human-readable name of this rule */
  name: string;

  /** Agent to notify */
  recipient: string;

  /** File path patterns that trigger this rule */
  patterns: RegExp[];

  /** Reason template for the notification */
  reason: string;

  /** Tags to attach */
  tags: string[];
}

/**
 * Result of notification routing
 */
export interface NotificationRoutingResult {
  /** All notifications to send */
  notifications: Notification[];

  /** Whether any notifications were generated */
  hasNotifications: boolean;

  /** The formatted NOTIFICATIONS.md entries */
  entries: string[];

  /** Summary message */
  message: string;
}

/**
 * Options for notification routing
 */
export interface NotificationRoutingOptions {
  /** PR number */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** PR URL */
  prUrl: string;

  /** Files changed in the PR */
  changedFiles: string[];

  /** Event that triggered this */
  event: 'opened' | 'merged' | 'reviewed' | 'closed';

  /** Date of the event (ISO string, defaults to now) */
  date?: string;

  /** Custom routing rules (overrides defaults if provided) */
  rules?: RoutingRule[];

  /** Author login (to avoid self-notification) */
  authorLogin?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default routing rules mapping file patterns to agent recipients
 */
export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    name: 'Security/Auth',
    recipient: '@Hawk',
    patterns: [
      /^src\/(auth|security|permissions?|rbac|jwt|oauth)\//i,
      /\/(auth|login|token|session|password)\.(ts|js)$/i,
      /\.env(\.example)?$/,
      /\bsecret\b/i,
    ],
    reason: 'Security-sensitive files modified — security review needed',
    tags: ['security', 'auth'],
  },
  {
    name: 'API Changes',
    recipient: '@Kai',
    patterns: [
      /^src\/(api|routes?|endpoints?|controllers?)\//i,
      /openapi\.(yaml|yml|json)$/i,
      /swagger\.(yaml|yml|json)$/i,
      /api[-_]spec/i,
    ],
    reason: 'API endpoints or spec modified — PM confirmation needed',
    tags: ['api'],
  },
  {
    name: 'Frontend/Design',
    recipient: '@Nova',
    patterns: [
      /^src\/(components?|pages?|views?|ui)\//i,
      /\.(css|scss|sass|less)$/i,
      /DESIGN\.(md|txt)$/i,
      /design-system/i,
    ],
    reason: 'Frontend or design files modified — design review needed',
    tags: ['design', 'frontend'],
  },
  {
    name: 'Database/Migrations',
    recipient: '@Luna',
    patterns: [
      /^(src\/)?(migrations?|db\/migrate)\//i,
      /prisma\/migrations\//i,
      /\.(sql)$/,
      /prisma\/schema\.prisma$/,
    ],
    reason: 'Database migrations or schema modified — backend review needed',
    tags: ['database', 'migrations'],
  },
];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if any changed file matches a routing rule
 */
export function filesMatchRoutingRule(files: string[], rule: RoutingRule): string[] {
  return files.filter((f) => rule.patterns.some((p) => p.test(f)));
}

/**
 * Format a notification entry for NOTIFICATIONS.md
 */
export function formatNotificationEntry(notification: Notification): string {
  const tagStr = notification.tags.length > 0
    ? ` [${notification.tags.join(', ')}]`
    : '';

  return (
    `[${notification.date.split('T')[0]}] ${notification.recipient} [session:hawky-auto]: ` +
    `**PR #${notification.prNumber}** — ${notification.prTitle}${tagStr}\n` +
    `  → ${notification.reason}\n` +
    `  → [View PR](${notification.prUrl})`
  );
}

/**
 * Route a PR event to appropriate team members via NOTIFICATIONS.md.
 *
 * For each routing rule, check if the PR's changed files match.
 * Deduplicate by recipient (each recipient gets at most one notification,
 * combining reasons if multiple rules match the same person).
 */
export function routeNotifications(
  options: NotificationRoutingOptions
): NotificationRoutingResult {
  const {
    prNumber,
    prTitle,
    prUrl,
    changedFiles,
    event,
    date = new Date().toISOString(),
    rules = DEFAULT_ROUTING_RULES,
    authorLogin,
  } = options;

  if (changedFiles.length === 0) {
    return {
      notifications: [],
      hasNotifications: false,
      entries: [],
      message: 'No changed files — no notifications to route',
    };
  }

  // Collect matches per recipient
  const recipientMap = new Map<
    string,
    { reasons: string[]; tags: Set<string>; triggerFiles: string[] }
  >();

  for (const rule of rules) {
    const matchingFiles = filesMatchRoutingRule(changedFiles, rule);
    if (matchingFiles.length === 0) continue;

    const existing = recipientMap.get(rule.recipient) ?? {
      reasons: [],
      tags: new Set<string>(),
      triggerFiles: [],
    };

    existing.reasons.push(rule.reason);
    rule.tags.forEach((t) => existing.tags.add(t));
    matchingFiles.forEach((f) => {
      if (!existing.triggerFiles.includes(f)) {
        existing.triggerFiles.push(f);
      }
    });

    recipientMap.set(rule.recipient, existing);
  }

  // Build notifications
  const notifications: Notification[] = [];

  for (const [recipient, data] of recipientMap) {
    // Skip self-notifications
    if (authorLogin && recipient === `@${authorLogin}`) continue;

    notifications.push({
      recipient,
      prNumber,
      prTitle,
      prUrl,
      reason: data.reasons.join('; '),
      event,
      date,
      tags: Array.from(data.tags),
    });
  }

  const entries = notifications.map(formatNotificationEntry);
  const hasNotifications = notifications.length > 0;

  let message: string;
  if (hasNotifications) {
    const recipients = notifications.map((n) => n.recipient).join(', ');
    message = `Routing PR #${prNumber} notifications to: ${recipients}`;
  } else {
    message = `No routing rules matched — no notifications generated`;
  }

  return {
    notifications,
    hasNotifications,
    entries,
    message,
  };
}

// ============================================================================
// Index
// ============================================================================

export { routeNotifications as default };
