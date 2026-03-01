/**
 * Tests for Protocol Sequence Detection (S053)
 */

import {
  isLgtmComment,
  isPMConfirmation,
  findHawkApproval,
  findPMConfirmation,
  checkProtocolSequence,
  formatProtocolSequenceInfo,
  DEFAULT_HAWK_LOGINS,
  DEFAULT_PM_LOGINS,
  type ReviewEvent,
  type ProtocolSequenceResult,
  type ProtocolSequenceOptions,
} from '../../src/sprint/protocol-sequence';

// ============================================================================
// Test helpers
// ============================================================================

function makeReview(
  login: string,
  type: ReviewEvent['type'],
  date: string,
  body = ''
): ReviewEvent {
  return { login, type, date, body };
}

function createOptions(
  reviewEvents: ReviewEvent[],
  overrides: Partial<ProtocolSequenceOptions> = {}
): ProtocolSequenceOptions {
  return {
    reviewEvents,
    ...overrides,
  };
}

// ============================================================================
// isLgtmComment
// ============================================================================

describe('isLgtmComment', () => {
  it('should detect "LGTM" in comment', () => {
    expect(isLgtmComment('LGTM!')).toBe(true);
  });

  it('should detect "lgtm" (case-insensitive)', () => {
    expect(isLgtmComment('looks great, lgtm')).toBe(true);
  });

  it('should detect :+1: emoji', () => {
    expect(isLgtmComment(':+1: great work')).toBe(true);
  });

  it('should detect "approved"', () => {
    expect(isLgtmComment('approved, ship it')).toBe(true);
  });

  it('should detect "looks good"', () => {
    expect(isLgtmComment('This looks good to me')).toBe(true);
  });

  it('should return false for neutral comments', () => {
    expect(isLgtmComment('Can you fix this nit?')).toBe(false);
  });

  it('should return false for empty comment', () => {
    expect(isLgtmComment('')).toBe(false);
  });
});

// ============================================================================
// isPMConfirmation
// ============================================================================

describe('isPMConfirmation', () => {
  it('should detect "confirmed"', () => {
    expect(isPMConfirmation('confirmed — tested locally')).toBe(true);
  });

  it('should detect "LGTM" from PM', () => {
    expect(isPMConfirmation('LGTM from my end')).toBe(true);
  });

  it('should detect "looks good"', () => {
    expect(isPMConfirmation('looks good on staging')).toBe(true);
  });

  it('should return false for unconfirmed comment', () => {
    expect(isPMConfirmation('Can you add tests?')).toBe(false);
  });
});

// ============================================================================
// findHawkApproval
// ============================================================================

describe('findHawkApproval', () => {
  it('should find Hawk approval by "approved" review type', () => {
    const events = [
      makeReview('hawk', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = findHawkApproval(events);
    expect(result).not.toBeNull();
    expect(result!.login).toBe('hawk');
  });

  it('should find Hawk approval by LGTM comment body', () => {
    const events = [
      makeReview('hawk', 'commented', '2026-03-01T10:00:00Z', 'LGTM, ship it'),
    ];
    const result = findHawkApproval(events);
    expect(result).not.toBeNull();
  });

  it('should return null when no Hawk events', () => {
    const events = [
      makeReview('kai', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = findHawkApproval(events);
    expect(result).toBeNull();
  });

  it('should return null when Hawk commented without LGTM', () => {
    const events = [
      makeReview('hawk', 'commented', '2026-03-01T10:00:00Z', 'Please fix this nit'),
    ];
    const result = findHawkApproval(events);
    expect(result).toBeNull();
  });

  it('should use custom hawk logins', () => {
    const events = [
      makeReview('my-hawk-bot', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = findHawkApproval(events, ['my-hawk-bot']);
    expect(result).not.toBeNull();
  });

  it('should be case-insensitive for login matching', () => {
    const events = [
      makeReview('Hawk', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = findHawkApproval(events);
    expect(result).not.toBeNull();
  });

  it('should return null for empty events', () => {
    expect(findHawkApproval([])).toBeNull();
  });
});

// ============================================================================
// findPMConfirmation
// ============================================================================

describe('findPMConfirmation', () => {
  it('should find Kai confirmation by approval', () => {
    const events = [makeReview('kai', 'approved', '2026-03-01T12:00:00Z')];
    const result = findPMConfirmation(events);
    expect(result).not.toBeNull();
    expect(result!.login).toBe('kai');
  });

  it('should find Maya confirmation by confirmation comment', () => {
    const events = [makeReview('maya', 'commented', '2026-03-01T12:00:00Z', 'confirmed — browser tested')];
    const result = findPMConfirmation(events);
    expect(result).not.toBeNull();
    expect(result!.login).toBe('maya');
  });

  it('should return null when no PM events', () => {
    const events = [makeReview('hawk', 'approved', '2026-03-01T10:00:00Z')];
    const result = findPMConfirmation(events);
    expect(result).toBeNull();
  });

  it('should return null when PM commented without confirmation keyword', () => {
    const events = [makeReview('kai', 'commented', '2026-03-01T12:00:00Z', 'Can you check this edge case?')];
    const result = findPMConfirmation(events);
    expect(result).toBeNull();
  });

  it('should use custom PM logins', () => {
    const events = [makeReview('my-pm', 'approved', '2026-03-01T12:00:00Z')];
    const result = findPMConfirmation(events, ['my-pm']);
    expect(result).not.toBeNull();
  });
});

// ============================================================================
// checkProtocolSequence
// ============================================================================

describe('checkProtocolSequence', () => {
  it('should return complete protocol when both approved in order', () => {
    const events = [
      makeReview('hawk', 'approved', '2026-03-01T10:00:00Z'),
      makeReview('kai', 'approved', '2026-03-01T12:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.protocolComplete).toBe(true);
    expect(result.hawkApproved).toBe(true);
    expect(result.pmConfirmed).toBe(true);
    expect(result.sequenceCorrect).toBe(true);
    expect(result.pmLogin).toBe('kai');
  });

  it('should detect protocol deviation when PM confirms before Hawk', () => {
    const events = [
      makeReview('kai', 'approved', '2026-03-01T10:00:00Z'), // PM first
      makeReview('hawk', 'approved', '2026-03-01T12:00:00Z'), // Hawk second
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApproved).toBe(true);
    expect(result.pmConfirmed).toBe(true);
    expect(result.sequenceCorrect).toBe(false);
    expect(result.protocolComplete).toBe(false);
  });

  it('should detect PM confirming without any Hawk approval', () => {
    const events = [
      makeReview('kai', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApproved).toBe(false);
    expect(result.pmConfirmed).toBe(true);
    expect(result.sequenceCorrect).toBe(false);
    expect(result.protocolComplete).toBe(false);
  });

  it('should return pending when nothing has happened', () => {
    const result = checkProtocolSequence(createOptions([]));

    expect(result.hawkApproved).toBe(false);
    expect(result.pmConfirmed).toBe(false);
    expect(result.sequenceCorrect).toBe(true);
    expect(result.protocolComplete).toBe(false);
    expect(result.message).toContain('waiting');
  });

  it('should return partial when only Hawk has approved', () => {
    const events = [
      makeReview('hawk', 'approved', '2026-03-01T10:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApproved).toBe(true);
    expect(result.pmConfirmed).toBe(false);
    expect(result.protocolComplete).toBe(false);
    expect(result.message).toContain('PM');
  });

  it('should include dates in complete protocol message', () => {
    const events = [
      makeReview('hawk', 'approved', '2026-03-01T10:00:00Z'),
      makeReview('kai', 'approved', '2026-03-01T12:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApprovalDate).toBe('2026-03-01T10:00:00Z');
    expect(result.pmConfirmationDate).toBe('2026-03-01T12:00:00Z');
  });

  it('should work with LGTM comments from Hawk', () => {
    const events = [
      makeReview('hawk', 'commented', '2026-03-01T10:00:00Z', 'LGTM!'),
      makeReview('kai', 'commented', '2026-03-01T12:00:00Z', 'confirmed — tested'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApproved).toBe(true);
    expect(result.pmConfirmed).toBe(true);
    expect(result.protocolComplete).toBe(true);
  });

  it('should support custom hawk and PM logins', () => {
    const events = [
      makeReview('my-reviewer', 'approved', '2026-03-01T10:00:00Z'),
      makeReview('my-pm', 'approved', '2026-03-01T12:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events, {
      hawkLogins: ['my-reviewer'],
      pmLogins: ['my-pm'],
    }));

    expect(result.protocolComplete).toBe(true);
  });

  it('should ignore changes_requested from Hawk as not an approval', () => {
    const events = [
      makeReview('hawk', 'changes_requested', '2026-03-01T10:00:00Z', 'Please fix this'),
      makeReview('kai', 'approved', '2026-03-01T12:00:00Z'),
    ];
    const result = checkProtocolSequence(createOptions(events));

    expect(result.hawkApproved).toBe(false);
    expect(result.pmConfirmed).toBe(true);
    expect(result.sequenceCorrect).toBe(false);
  });
});

// ============================================================================
// formatProtocolSequenceInfo
// ============================================================================

describe('formatProtocolSequenceInfo', () => {
  function makeResult(overrides: Partial<ProtocolSequenceResult> = {}): ProtocolSequenceResult {
    return {
      hawkApproved: false,
      pmConfirmed: false,
      sequenceCorrect: true,
      protocolComplete: false,
      hawkApprovalDate: null,
      pmConfirmationDate: null,
      pmLogin: null,
      message: 'Pending',
      ...overrides,
    };
  }

  it('should return empty string when protocol is complete', () => {
    const result = makeResult({
      protocolComplete: true,
      hawkApproved: true,
      pmConfirmed: true,
      sequenceCorrect: true,
    });
    expect(formatProtocolSequenceInfo(result)).toBe('');
  });

  it('should return output when protocol is incomplete', () => {
    const result = makeResult();
    const output = formatProtocolSequenceInfo(result);
    expect(output).not.toBe('');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should indicate protocol deviation when PM confirmed before Hawk', () => {
    const result = makeResult({
      hawkApproved: false,
      pmConfirmed: true,
      sequenceCorrect: false,
      pmLogin: 'kai',
      message: 'Protocol deviation: kai confirmed before hawk reviewed',
    });
    const output = formatProtocolSequenceInfo(result);
    expect(output.toLowerCase()).toContain('deviation');
  });

  it('should indicate awaiting Hawk when only Hawk pending', () => {
    const result = makeResult({ hawkApproved: false, pmConfirmed: false });
    const output = formatProtocolSequenceInfo(result);
    expect(output).toContain('@Hawk');
  });

  it('should indicate awaiting PM when Hawk approved but PM pending', () => {
    const result = makeResult({
      hawkApproved: true,
      pmConfirmed: false,
      hawkApprovalDate: '2026-03-01T10:00:00Z',
    });
    const output = formatProtocolSequenceInfo(result);
    expect(output).toContain('PM');
  });

  it('should note this is INFORM, no action required', () => {
    const result = makeResult();
    const output = formatProtocolSequenceInfo(result);
    expect(output.toUpperCase()).toContain('INFORM');
  });

  it('should wrap in details/summary tags', () => {
    const result = makeResult();
    const output = formatProtocolSequenceInfo(result);
    expect(output).toContain('<details>');
    expect(output).toContain('</details>');
    expect(output).toContain('<summary>');
  });
});
