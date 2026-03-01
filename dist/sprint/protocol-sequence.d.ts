/**
 * Protocol Sequence Detection (S053)
 *
 * Verifies the mandatory review protocol is being followed:
 *   Engineer builds → @Hawk reviews → PM confirms → Done
 *
 * Checks PR review events to ensure @Hawk LGTM occurs before
 * PM (@Kai or @Maya) confirmation. Flags out-of-order confirmations.
 *
 * Output: INFORM tier finding (not blocking, but flagging protocol deviation).
 */
/**
 * A review or confirmation event on a PR
 */
export interface ReviewEvent {
    /** GitHub login of the reviewer */
    login: string;
    /** Type of review event */
    type: 'approved' | 'changes_requested' | 'commented' | 'lgtm_comment';
    /** Date of the event (ISO string) */
    date: string;
    /** Optional comment body (for comment-type events) */
    body?: string;
}
/**
 * Protocol check result
 */
export interface ProtocolSequenceResult {
    /** Whether Hawk has approved/LGTM'd */
    hawkApproved: boolean;
    /** Whether PM has confirmed */
    pmConfirmed: boolean;
    /** Whether the protocol sequence is correct (Hawk before PM) */
    sequenceCorrect: boolean;
    /** Whether the protocol is complete (both Hawk and PM done) */
    protocolComplete: boolean;
    /** Date of Hawk's approval (null if not yet approved) */
    hawkApprovalDate: string | null;
    /** Date of PM's confirmation (null if not yet confirmed) */
    pmConfirmationDate: string | null;
    /** The PM who confirmed (if any) */
    pmLogin: string | null;
    /** Human-readable status message */
    message: string;
}
/**
 * Options for protocol sequence detection
 */
export interface ProtocolSequenceOptions {
    /** Review events on the PR (sorted by date ascending) */
    reviewEvents: ReviewEvent[];
    /**
     * GitHub login(s) considered as @Hawk (the code reviewer).
     * Default: ['hawk', 'hawky', 'hawk-bot']
     */
    hawkLogins?: string[];
    /**
     * GitHub login(s) considered as PM confirmers (@Kai or @Maya).
     * Default: ['kai', 'maya']
     */
    pmLogins?: string[];
    /**
     * Keywords in comments that count as LGTM from Hawk.
     * Default: ['LGTM', 'lgtm', ':+1:', '✓', '✅', 'approved']
     */
    lgtmKeywords?: string[];
    /**
     * Keywords in comments that count as PM confirmation.
     * Default: ['confirmed', 'confirm', 'looks good', 'LGTM', ':+1:']
     */
    confirmKeywords?: string[];
}
/**
 * Minimal Octokit interface for protocol sequence check
 */
export interface ProtocolOctokitLike {
    rest: {
        pulls: {
            listReviews(params: {
                owner: string;
                repo: string;
                pull_number: number;
            }): Promise<{
                data: Array<{
                    user: {
                        login: string;
                    } | null;
                    state: string;
                    submitted_at: string | null;
                    body: string;
                }>;
            }>;
            listReviewComments(params: {
                owner: string;
                repo: string;
                pull_number: number;
                per_page: number;
            }): Promise<{
                data: Array<{
                    user: {
                        login: string;
                    } | null;
                    body: string;
                    created_at: string;
                }>;
            }>;
        };
        issues: {
            listComments(params: {
                owner: string;
                repo: string;
                issue_number: number;
                per_page: number;
            }): Promise<{
                data: Array<{
                    user: {
                        login: string;
                    } | null;
                    body: string;
                    created_at: string;
                }>;
            }>;
        };
    };
}
export declare const DEFAULT_HAWK_LOGINS: string[];
export declare const DEFAULT_PM_LOGINS: string[];
export declare const DEFAULT_LGTM_KEYWORDS: string[];
export declare const DEFAULT_CONFIRM_KEYWORDS: string[];
/**
 * Check if a comment body contains an LGTM-like signal
 */
export declare function isLgtmComment(body: string, keywords?: string[]): boolean;
/**
 * Check if a comment body contains a PM confirmation signal
 */
export declare function isPMConfirmation(body: string, keywords?: string[]): boolean;
/**
 * Find the most recent LGTM/approval from Hawk in the review events.
 * Returns the event or null if not found.
 */
export declare function findHawkApproval(events: ReviewEvent[], hawkLogins?: string[], lgtmKeywords?: string[]): ReviewEvent | null;
/**
 * Find the most recent PM confirmation in the review events.
 * Returns the event or null if not found.
 */
export declare function findPMConfirmation(events: ReviewEvent[], pmLogins?: string[], confirmKeywords?: string[]): ReviewEvent | null;
/**
 * Check the review protocol sequence for a PR.
 *
 * Validates:
 * 1. Hawk has approved/LGTM'd
 * 2. PM has confirmed
 * 3. Hawk's approval happened BEFORE PM's confirmation
 */
export declare function checkProtocolSequence(options: ProtocolSequenceOptions): ProtocolSequenceResult;
/**
 * Fetch review events from GitHub API and check protocol sequence
 */
export declare function fetchAndCheckProtocol(octokit: ProtocolOctokitLike, owner: string, repo: string, prNumber: number, options: Omit<ProtocolSequenceOptions, 'reviewEvents'>): Promise<ProtocolSequenceResult>;
/**
 * Format protocol sequence result as a PR comment section.
 * Only produces output when protocol is not followed correctly.
 */
export declare function formatProtocolSequenceInfo(result: ProtocolSequenceResult): string;
export { checkProtocolSequence as default };
//# sourceMappingURL=protocol-sequence.d.ts.map