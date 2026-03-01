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
/**
 * File path patterns indicating API changes that frontend needs to know about
 */
export declare const API_CHANGE_PATTERNS: RegExp[];
/**
 * File path patterns indicating schema/contract changes
 */
export declare const SCHEMA_CHANGE_PATTERNS: RegExp[];
/**
 * File path patterns indicating auth changes relevant to all teams
 */
export declare const AUTH_CHANGE_PATTERNS: RegExp[];
/**
 * Check if any file in a list matches any pattern
 */
export declare function anyFileMatches(files: string[], patterns: RegExp[]): string[];
/**
 * Generate handoff notifications based on what changed in the merged PR.
 *
 * Logic:
 * - API changes → notify @Nova (frontend needs to integrate)
 * - Schema changes → notify @Nova and @Latch
 * - Auth changes → notify @Hawk and @Kai
 * - Always log completion for general awareness
 */
export declare function generateHandoffNotifications(options: HandoffOptions): HandoffResult;
export { generateHandoffNotifications as default };
//# sourceMappingURL=session-handoff.d.ts.map