/**
 * Session Handoff Notification (S042)
 *
 * When an API PR merges, notifies dependent frontend teams that new
 * endpoints are available and they may need to update their integration.
 *
 * Also generates general "work available" notifications when significant
 * PRs merge so other agents know to rebase or pick up downstream work.
 *
 * Output: INFORM tier — generates NOTIFICATIONS.md entries (caller writes).
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A handoff notification to generate
 */
export interface HandoffNotification {
  /** Recipient agent (e.g., '@Nova') */
  recipient: string;

  /** Reason for the handoff */
  reason: string;

  /** Details about what changed */
  details: string;

  /** Context tags */
  tags: string[];
}

/**
 * Result of handoff notification generation
 */
export interface HandoffResult {
  /** Whether any handoff notifications were generated */
  hasHandoffs: boolean;

  /** All handoff notifications */
  notifications: HandoffNotification[];

  /** Formatted NOTIFICATIONS.md entries */
  entries: string[];

  /** Summary message */
  message: string;
}

/**
 * Options for session handoff notification
 */
export interface HandoffOptions {
  /** PR number that was merged */
  prNumber: number;

  /** PR title */
  prTitle: string;

  /** PR URL */
  prUrl: string;

  /** PR author login */
  authorLogin: string;

  /** Head branch name */
  headBranch: string;

  /** Base branch that was merged into */
  baseBranch: string;

  /** Files that were changed */
  changedFiles: string[];

  /** PR labels */
  labels: string[];

  /** Date of merge (ISO string) */
  date: string;

  /** Project name for log entries */
  projectName?: string;

  /** Session ID for log entries */
  sessionId?: string;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * File path patterns indicating API changes that frontend needs to know about
 */
export const API_CHANGE_PATTERNS: RegExp[] = [
  /^src\/(api|routes?|endpoints?|controllers?)\//i,
  /openapi\.(yaml|yml|json)$/i,
  /swagger\.(yaml|yml|json)$/i,
  /api[-_]spec/i,
];

/**
 * File path patterns indicating schema/contract changes
 */
export const SCHEMA_CHANGE_PATTERNS: RegExp[] = [
  /schema\.(graphql|gql|json)$/i,
  /prisma\/schema\.prisma$/,
  /\.proto$/,
];

/**
 * File path patterns indicating auth changes relevant to all teams
 */
export const AUTH_CHANGE_PATTERNS: RegExp[] = [
  /^src\/(auth|security|permissions?)\//i,
  /\.env(\.example)?$/,
];

/**
 * Check if any file in a list matches any pattern
 */
export function anyFileMatches(files: string[], patterns: RegExp[]): string[] {
  return files.filter((f) => patterns.some((p) => p.test(f)));
}

/**
 * Generate handoff notifications based on what changed in the merged PR.
 *
 * Logic:
 * - API changes → notify @Nova (frontend needs to integrate)
 * - Schema changes → notify @Nova and @Latch
 * - Auth changes → notify @Hawk and @Kai
 * - Always log completion for general awareness
 */
export function generateHandoffNotifications(options: HandoffOptions): HandoffResult {
  const {
    prNumber,
    prTitle,
    prUrl,
    authorLogin,
    headBranch,
    changedFiles,
    labels,
    date,
    projectName = 'hawky',
    sessionId = 'hawky-auto',
  } = options;

  const dateStr = date.split('T')[0];
  const storyMatch = /(?:^|[-_/])([Ss]\d{3,4})(?:[-_/]|$)/.exec(headBranch);
  const storyRef = storyMatch ? ` (${storyMatch[1].toUpperCase()})` : '';

  const notifications: HandoffNotification[] = [];

  // API changes → notify frontend (@Nova)
  const apiFiles = anyFileMatches(changedFiles, API_CHANGE_PATTERNS);
  if (apiFiles.length > 0) {
    const fileNames = apiFiles.slice(0, 3).map((f) => f.split('/').pop() ?? f).join(', ');
    notifications.push({
      recipient: '@Nova',
      reason: `API endpoints merged — PR #${prNumber}${storyRef}`,
      details:
        `New API changes are available in \`${options.baseBranch}\`. ` +
        `Files: ${fileNames}${apiFiles.length > 3 ? ` +${apiFiles.length - 3} more` : ''}. ` +
        `[View PR](${prUrl})`,
      tags: ['api', 'handoff'],
    });
  }

  // Schema/contract changes → notify @Nova and @Latch
  const schemaFiles = anyFileMatches(changedFiles, SCHEMA_CHANGE_PATTERNS);
  if (schemaFiles.length > 0) {
    const fileNames = schemaFiles.map((f) => f.split('/').pop() ?? f).join(', ');
    notifications.push({
      recipient: '@Nova',
      reason: `Schema changes merged — PR #${prNumber}${storyRef}`,
      details:
        `Data schema was updated in \`${options.baseBranch}\`. ` +
        `Files: ${fileNames}. Update your queries/types accordingly. ` +
        `[View PR](${prUrl})`,
      tags: ['schema', 'handoff'],
    });
    notifications.push({
      recipient: '@Latch',
      reason: `Schema changes merged — PR #${prNumber}${storyRef}`,
      details:
        `Database schema was updated. Check for migration compatibility. ` +
        `Files: ${fileNames}. [View PR](${prUrl})`,
      tags: ['schema', 'database', 'handoff'],
    });
  }

  // Auth changes → notify @Hawk and @Kai
  const authFiles = anyFileMatches(changedFiles, AUTH_CHANGE_PATTERNS);
  if (authFiles.length > 0) {
    notifications.push({
      recipient: '@Kai',
      reason: `Auth/security changes merged — PR #${prNumber}${storyRef}`,
      details:
        `Authentication or security files changed. PM verification may be needed. ` +
        `[View PR](${prUrl})`,
      tags: ['security', 'auth', 'handoff'],
    });
  }

  // Deduplicate by recipient (merge notifications to same person)
  const dedupedMap = new Map<string, HandoffNotification>();
  for (const notif of notifications) {
    const existing = dedupedMap.get(notif.recipient);
    if (existing) {
      existing.reason += `; ${notif.reason}`;
      existing.details += `\n  ${notif.details}`;
      existing.tags = [...new Set([...existing.tags, ...notif.tags])];
    } else {
      dedupedMap.set(notif.recipient, { ...notif });
    }
  }

  const deduped = Array.from(dedupedMap.values());

  // Format entries for NOTIFICATIONS.md
  const entries = deduped.map((notif) => {
    const tagStr = notif.tags.length > 0 ? ` [${notif.tags.join(', ')}]` : '';
    return (
      `[${dateStr}] ${notif.recipient} [session:${sessionId}]: ` +
      `**Handoff: PR #${prNumber} merged by @${authorLogin}**${tagStr}\n` +
      `  → ${notif.reason}\n` +
      `  → ${notif.details}`
    );
  });

  const hasHandoffs = deduped.length > 0;

  let message: string;
  if (hasHandoffs) {
    const recipients = deduped.map((n) => n.recipient).join(', ');
    message = `Generated ${deduped.length} handoff notification(s) for: ${recipients}`;
  } else {
    message = 'No handoff notifications needed — no downstream-impact changes detected';
  }

  return {
    hasHandoffs,
    notifications: deduped,
    entries,
    message,
  };
}

// ============================================================================
// Index
// ============================================================================

export { generateHandoffNotifications as default };
