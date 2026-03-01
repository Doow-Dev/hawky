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

// ============================================================================
// Types
// ============================================================================

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
          user: { login: string } | null;
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
          user: { login: string } | null;
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
          user: { login: string } | null;
          body: string;
          created_at: string;
        }>;
      }>;
    };
  };
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_HAWK_LOGINS = ['hawk', 'hawky', 'hawk-bot'];
export const DEFAULT_PM_LOGINS = ['kai', 'maya'];
export const DEFAULT_LGTM_KEYWORDS = ['LGTM', 'lgtm', ':+1:', '✓', '✅', 'approved', 'looks good'];
export const DEFAULT_CONFIRM_KEYWORDS = ['confirmed', 'confirm', 'LGTM', 'lgtm', ':+1:', 'looks good', '✅'];

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Check if a comment body contains an LGTM-like signal
 */
export function isLgtmComment(body: string, keywords: string[] = DEFAULT_LGTM_KEYWORDS): boolean {
  const lower = body.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if a comment body contains a PM confirmation signal
 */
export function isPMConfirmation(body: string, keywords: string[] = DEFAULT_CONFIRM_KEYWORDS): boolean {
  const lower = body.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Find the most recent LGTM/approval from Hawk in the review events.
 * Returns the event or null if not found.
 */
export function findHawkApproval(
  events: ReviewEvent[],
  hawkLogins: string[] = DEFAULT_HAWK_LOGINS,
  lgtmKeywords: string[] = DEFAULT_LGTM_KEYWORDS
): ReviewEvent | null {
  const hawkLoginSet = new Set(hawkLogins.map((l) => l.toLowerCase()));

  // Look through events in reverse to find the most recent
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!hawkLoginSet.has(event.login.toLowerCase())) continue;

    // Direct approval
    if (event.type === 'approved') return event;

    // LGTM comment
    if (event.type === 'lgtm_comment' || (event.body && isLgtmComment(event.body, lgtmKeywords))) {
      return event;
    }
  }

  return null;
}

/**
 * Find the most recent PM confirmation in the review events.
 * Returns the event or null if not found.
 */
export function findPMConfirmation(
  events: ReviewEvent[],
  pmLogins: string[] = DEFAULT_PM_LOGINS,
  confirmKeywords: string[] = DEFAULT_CONFIRM_KEYWORDS
): ReviewEvent | null {
  const pmLoginSet = new Set(pmLogins.map((l) => l.toLowerCase()));

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!pmLoginSet.has(event.login.toLowerCase())) continue;

    // Direct approval counts as confirmation
    if (event.type === 'approved') return event;

    // Confirmation comment
    if (event.body && isPMConfirmation(event.body, confirmKeywords)) {
      return event;
    }
  }

  return null;
}

/**
 * Check the review protocol sequence for a PR.
 *
 * Validates:
 * 1. Hawk has approved/LGTM'd
 * 2. PM has confirmed
 * 3. Hawk's approval happened BEFORE PM's confirmation
 */
export function checkProtocolSequence(options: ProtocolSequenceOptions): ProtocolSequenceResult {
  const {
    reviewEvents,
    hawkLogins = DEFAULT_HAWK_LOGINS,
    pmLogins = DEFAULT_PM_LOGINS,
    lgtmKeywords = DEFAULT_LGTM_KEYWORDS,
    confirmKeywords = DEFAULT_CONFIRM_KEYWORDS,
  } = options;

  const hawkApprovalEvent = findHawkApproval(reviewEvents, hawkLogins, lgtmKeywords);
  const pmConfirmEvent = findPMConfirmation(reviewEvents, pmLogins, confirmKeywords);

  const hawkApproved = hawkApprovalEvent !== null;
  const pmConfirmed = pmConfirmEvent !== null;
  const hawkApprovalDate = hawkApprovalEvent?.date ?? null;
  const pmConfirmationDate = pmConfirmEvent?.date ?? null;
  const pmLogin = pmConfirmEvent?.login ?? null;

  // Sequence is correct if Hawk approved before PM confirmed, or if one/both haven't happened yet
  let sequenceCorrect = true;
  if (hawkApproved && pmConfirmed && hawkApprovalDate && pmConfirmationDate) {
    sequenceCorrect = hawkApprovalDate <= pmConfirmationDate;
  } else if (!hawkApproved && pmConfirmed) {
    // PM confirmed before Hawk reviewed — wrong order
    sequenceCorrect = false;
  }

  const protocolComplete = hawkApproved && pmConfirmed && sequenceCorrect;

  let message: string;
  if (protocolComplete) {
    message = `Protocol complete: @Hawk approved (${hawkApprovalDate}) → @${pmLogin} confirmed (${pmConfirmationDate})`;
  } else if (!hawkApproved && !pmConfirmed) {
    message = 'Protocol pending: waiting for @Hawk review';
  } else if (hawkApproved && !pmConfirmed) {
    message = `@Hawk has approved — waiting for PM confirmation`;
  } else if (!hawkApproved && pmConfirmed) {
    message = `Protocol deviation: @${pmLogin} confirmed before @Hawk reviewed. @Hawk review should come first.`;
  } else if (hawkApproved && pmConfirmed && !sequenceCorrect) {
    message = `Protocol deviation: PM confirmed at ${pmConfirmationDate}, but @Hawk approved at ${hawkApprovalDate} (after). Hawk should review first.`;
  } else {
    message = 'Protocol status unknown';
  }

  return {
    hawkApproved,
    pmConfirmed,
    sequenceCorrect,
    protocolComplete,
    hawkApprovalDate,
    pmConfirmationDate,
    pmLogin,
    message,
  };
}

/**
 * Fetch review events from GitHub API and check protocol sequence
 */
export async function fetchAndCheckProtocol(
  octokit: ProtocolOctokitLike,
  owner: string,
  repo: string,
  prNumber: number,
  options: Omit<ProtocolSequenceOptions, 'reviewEvents'>
): Promise<ProtocolSequenceResult> {
  // Fetch formal reviews
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Fetch issue comments (PR general comments)
  const { data: issueComments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  // Combine into ReviewEvent list
  const events: ReviewEvent[] = [];

  for (const review of reviews) {
    if (!review.user || !review.submitted_at) continue;
    events.push({
      login: review.user.login,
      type: review.state === 'APPROVED' ? 'approved' :
            review.state === 'CHANGES_REQUESTED' ? 'changes_requested' : 'commented',
      date: review.submitted_at,
      body: review.body,
    });
  }

  for (const comment of issueComments) {
    if (!comment.user) continue;
    events.push({
      login: comment.user.login,
      type: 'commented',
      date: comment.created_at,
      body: comment.body,
    });
  }

  // Sort by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date));

  return checkProtocolSequence({ ...options, reviewEvents: events });
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format protocol sequence result as a PR comment section.
 * Only produces output when protocol is not followed correctly.
 */
export function formatProtocolSequenceInfo(result: ProtocolSequenceResult): string {
  if (result.protocolComplete) {
    return '';
  }

  const lines: string[] = [];

  lines.push('<details>');

  if (!result.sequenceCorrect && result.pmConfirmed && !result.hawkApproved) {
    lines.push(
      `<summary>:information_source: **Protocol Deviation** — PM confirmed before @Hawk reviewed</summary>`
    );
    lines.push('');
    lines.push(result.message);
    lines.push('');
    lines.push('**Required sequence:**');
    lines.push('1. Engineer opens PR');
    lines.push('2. **@Hawk reviews** (code quality, security)');
    lines.push('3. **PM confirms** (@Kai: endpoint test / @Maya: browser test)');
    lines.push('4. Merge');
    lines.push('');
    lines.push('*The PM confirmation should follow after @Hawk review.*');
  } else if (!result.hawkApproved) {
    lines.push(
      `<summary>:information_source: **Awaiting @Hawk Review**</summary>`
    );
    lines.push('');
    lines.push('This PR is waiting for @Hawk code review before PM confirmation.');
    lines.push('');
    lines.push('**Workflow:** @Hawk reviews → PM confirms → merge');
  } else if (result.hawkApproved && !result.pmConfirmed) {
    lines.push(
      `<summary>:information_source: **Awaiting PM Confirmation**</summary>`
    );
    lines.push('');
    lines.push(`@Hawk has reviewed and approved. Waiting for PM confirmation (@Kai or @Maya).`);
    lines.push('');
    lines.push('**Next step:** PM tests the feature/endpoint and confirms.');
  } else {
    lines.push(`<summary>:information_source: **Protocol Status**</summary>`);
    lines.push('');
    lines.push(result.message);
  }

  lines.push('');
  lines.push('*This is INFORM — no action required from engineer.*');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ============================================================================
// Index
// ============================================================================

export { checkProtocolSequence as default };
