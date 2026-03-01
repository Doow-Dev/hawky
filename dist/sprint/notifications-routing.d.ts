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
/**
 * Default routing rules mapping file patterns to agent recipients
 */
export declare const DEFAULT_ROUTING_RULES: RoutingRule[];
/**
 * Check if any changed file matches a routing rule
 */
export declare function filesMatchRoutingRule(files: string[], rule: RoutingRule): string[];
/**
 * Format a notification entry for NOTIFICATIONS.md
 */
export declare function formatNotificationEntry(notification: Notification): string;
/**
 * Route a PR event to appropriate team members via NOTIFICATIONS.md.
 *
 * For each routing rule, check if the PR's changed files match.
 * Deduplicate by recipient (each recipient gets at most one notification,
 * combining reasons if multiple rules match the same person).
 */
export declare function routeNotifications(options: NotificationRoutingOptions): NotificationRoutingResult;
export { routeNotifications as default };
//# sourceMappingURL=notifications-routing.d.ts.map