import { describe, it, expect } from 'vitest';
import {
  classifyCardCode,
  decideGateAction,
  decideScan,
  describeDeparture,
  formatLateness,
  minutesLate,
  type ScannedPass,
  type ScanSubject,
} from '@/lib/services/campus-living/gate-scan-resolve';

// A fixed "now" so every assertion is deterministic. 2026-08-14, 8:40 PM IST.
const NOW = new Date('2026-08-14T15:10:00.000Z');

/** 8:00 PM IST on the same evening — 40 minutes BEFORE NOW. */
const DUE_8PM = '2026-08-14T14:30:00.000Z';
/** 10:00 PM IST — 1h20m AFTER NOW. */
const DUE_10PM = '2026-08-14T16:30:00.000Z';

function pass(overrides: Partial<ScannedPass> = {}): ScannedPass {
  return {
    id: 'pass-1',
    status: 'issued',
    destination: 'Home',
    expected_return: DUE_10PM,
    out_time: null,
    pass_number: 'GP-0001',
    ...overrides,
  };
}

describe('decideGateAction — GREEN, an approved pass the learner has not used yet', () => {
  it('an issued pass still inside its window is APPROVED and the one tap is OUT', () => {
    const d = decideGateAction([pass()], NOW);
    expect(d.verdict).toBe('approved');
    expect(d.action).toBe('out');
    expect(d.headline).toBe('APPROVED');
    expect(d.pass?.id).toBe('pass-1');
    expect(d.isLate).toBe(false);
    expect(d.lateByMinutes).toBe(0);
  });

  it('the second line names the return time and the destination', () => {
    const d = decideGateAction([pass({ destination: 'Home' })], NOW);
    expect(d.detail).toContain('Home');
    expect(d.detail).toMatch(/Out till/);
  });

  it('with two open passes it acts on the one due back soonest', () => {
    const d = decideGateAction(
      [
        pass({ id: 'later', expected_return: '2026-08-14T18:00:00.000Z' }),
        pass({ id: 'sooner', expected_return: DUE_10PM }),
      ],
      NOW
    );
    expect(d.verdict).toBe('approved');
    expect(d.pass?.id).toBe('sooner');
  });
});

describe('decideGateAction — RED, a hard block with no override', () => {
  it('no passes at all is BLOCKED', () => {
    const d = decideGateAction([], NOW);
    expect(d.verdict).toBe('blocked');
    expect(d.headline).toBe('NO APPROVED PASS');
  });

  it('a blocked verdict exposes NO action — the screen has nothing to tap', () => {
    const d = decideGateAction([], NOW);
    expect(d.action).toBeNull();
    expect(d.pass).toBeNull();
  });

  it('only returned passes is BLOCKED — a closed pass is not a licence to leave', () => {
    const d = decideGateAction([pass({ status: 'returned' })], NOW);
    expect(d.verdict).toBe('blocked');
    expect(d.action).toBeNull();
  });

  it('a cancelled pass is BLOCKED', () => {
    const d = decideGateAction([pass({ status: 'cancelled' })], NOW);
    expect(d.verdict).toBe('blocked');
  });

  it('an issued pass whose window already closed is BLOCKED, and says when it closed', () => {
    const d = decideGateAction([pass({ status: 'issued', expected_return: DUE_8PM })], NOW);
    expect(d.verdict).toBe('blocked');
    expect(d.action).toBeNull();
    expect(d.detail).toMatch(/closed at/);
  });
});

describe('decideGateAction — AMBER, the learner is out and coming back', () => {
  it('an active pass still inside its window is RETURNING and the one tap is IN', () => {
    const d = decideGateAction(
      [pass({ status: 'active', expected_return: DUE_10PM, out_time: '2026-08-14T12:00:00.000Z' })],
      NOW
    );
    expect(d.verdict).toBe('returning');
    expect(d.action).toBe('in');
    expect(d.headline).toBe('RETURNING');
    expect(d.isLate).toBe(false);
    expect(d.lateByMinutes).toBe(0);
  });

  it('an active pass past its return time is RETURNING with the late flag set', () => {
    const d = decideGateAction(
      [pass({ status: 'active', expected_return: DUE_8PM, out_time: '2026-08-14T12:00:00.000Z' })],
      NOW
    );
    expect(d.verdict).toBe('returning');
    expect(d.action).toBe('in');
    expect(d.isLate).toBe(true);
    expect(d.lateByMinutes).toBe(40);
    expect(d.detail).toContain('40 minutes late');
  });

  it('an overdue pass is RETURNING too — late never turns into a block', () => {
    const d = decideGateAction([pass({ status: 'overdue', expected_return: DUE_8PM })], NOW);
    expect(d.verdict).toBe('returning');
    expect(d.action).toBe('in');
    expect(d.isLate).toBe(true);
  });

  it('being outside outranks a fresh approval — never offer OUT to someone already out', () => {
    const d = decideGateAction(
      [
        pass({ id: 'fresh', status: 'issued', expected_return: DUE_10PM }),
        pass({ id: 'out-now', status: 'active', expected_return: DUE_8PM }),
      ],
      NOW
    );
    expect(d.verdict).toBe('returning');
    expect(d.action).toBe('in');
    expect(d.pass?.id).toBe('out-now');
  });
});

describe('minutesLate', () => {
  it('counts whole minutes past the return time', () => {
    expect(minutesLate(DUE_8PM, NOW)).toBe(40);
  });

  it('is 0 when the return time has not arrived', () => {
    expect(minutesLate(DUE_10PM, NOW)).toBe(0);
  });

  it('is 0 exactly on the return time — on time is not late', () => {
    expect(minutesLate(NOW.toISOString(), NOW)).toBe(0);
  });

  it('is 0 for an unparseable timestamp rather than NaN', () => {
    expect(minutesLate('not-a-date', NOW)).toBe(0);
  });
});

describe('formatLateness', () => {
  it('reads minutes under an hour', () => {
    expect(formatLateness(40)).toBe('40 minutes late');
  });

  it('singularises one minute', () => {
    expect(formatLateness(1)).toBe('1 minute late');
  });

  it('reads a whole hour without a trailing zero', () => {
    expect(formatLateness(120)).toBe('2 hours late');
  });

  it('reads hours and minutes together', () => {
    expect(formatLateness(80)).toBe('1 hour 20 minutes late');
  });

  it('says on time for zero', () => {
    expect(formatLateness(0)).toBe('on time');
  });
});

describe('classifyCardCode — the card carries a UUID today and a JKKN ID soon', () => {
  it('recognises the raw learners_profiles UUID the card encodes today', () => {
    expect(classifyCardCode('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe('uuid');
  });

  it('recognises an uppercase UUID', () => {
    expect(classifyCardCode('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('uuid');
  });

  it('recognises the permanent JKKN ID the sibling lane is switching to', () => {
    expect(classifyCardCode('348295-7')).toBe('jkkn_id');
  });

  it('tolerates surrounding whitespace from a scanner that appends a newline', () => {
    expect(classifyCardCode('  348295-7\n')).toBe('jkkn_id');
  });

  it('calls anything else unknown rather than guessing', () => {
    expect(classifyCardCode('GP-0001')).toBe('unknown');
    expect(classifyCardCode('')).toBe('unknown');
    expect(classifyCardCode('34829-57')).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────
// The scan-time leaver guard
// ─────────────────────────────────────────────────────────────────────

/**
 * Director decision 2026-08-13: a person who has left must go RED at the
 * scanner, not merely be refused a reprint. The plastic in their pocket keeps
 * working; the record is the only thing that knows they have gone.
 *
 * NEGATIVE CONTROL. Every assertion below was run against a `decideScan` that
 * delegated straight to `decideGateAction` with no subject check — the shipped
 * behaviour before this change. The refusal tests failed there: a graduated
 * learner came back APPROVED with `action: 'out'`. The "still here" cases
 * passed then and pass now, which is what makes them the guard against
 * over-blocking rather than a restatement of the code.
 */
const STILL_HERE: ScanSubject = { kind: 'learner', lifecycleStatus: 'active' };

describe('decideScan — a leaver goes RED even holding a valid pass', () => {
  it('a graduated learner with an approved, in-window pass is BLOCKED', () => {
    const d = decideScan({ kind: 'learner', lifecycleStatus: 'graduated' }, [pass()], NOW);
    expect(d.verdict).toBe('blocked');
    expect(d.blockedReason).toBe('has_left');
  });

  it('the same scan without the guard would have been GREEN — that is the point', () => {
    // Same passes, same clock: only the subject differs.
    const allowed = decideScan(STILL_HERE, [pass()], NOW);
    expect(allowed.verdict).toBe('approved');
    expect(allowed.action).toBe('out');
  });

  it('every lifecycle status that means "has left" is refused', () => {
    for (const status of ['graduated', 'exited', 'inactive', 'withdrawal_pending', 'alumni']) {
      const d = decideScan({ kind: 'learner', lifecycleStatus: status }, [pass()], NOW);
      expect(d.verdict, `status ${status} must be blocked`).toBe('blocked');
      expect(d.blockedReason).toBe('has_left');
    }
  });

  it('RED stays a hard block — no pass, no action, no override', () => {
    const d = decideScan({ kind: 'learner', lifecycleStatus: 'exited' }, [pass()], NOW);
    expect(d.action).toBeNull();
    expect(d.pass).toBeNull();
  });

  it('the reason names the actual status, so the guard can say why', () => {
    const d = decideScan({ kind: 'learner', lifecycleStatus: 'graduated' }, [], NOW);
    expect(d.headline).toBe('CARD NO LONGER VALID');
    expect(d.detail).toContain('graduated');
    expect(d.detail).toContain('no longer on the rolls');
  });

  it('the reason tells the guard what to do about a pass left open', () => {
    const d = decideScan({ kind: 'learner', lifecycleStatus: 'graduated' }, [pass()], NOW);
    expect(d.detail).toMatch(/warden must close it/);
  });

  it('a leaver already OUTSIDE is still blocked — the check precedes RETURNING', () => {
    // A learner who left while out cannot be walked back in on a dead card.
    // The pass stays open until a warden closes it, which the detail says.
    const d = decideScan(
      { kind: 'learner', lifecycleStatus: 'exited' },
      [pass({ status: 'active', out_time: '2026-08-14T12:00:00.000Z' })],
      NOW
    );
    expect(d.verdict).toBe('blocked');
    expect(d.blockedReason).toBe('has_left');
    expect(d.action).toBeNull();
  });

  it('a team member who is no longer active is refused', () => {
    const d = decideScan({ kind: 'team_member', isActive: false }, [pass()], NOW);
    expect(d.verdict).toBe('blocked');
    expect(d.blockedReason).toBe('has_left');
    expect(d.detail).toContain('team member');
  });
});

describe('decideScan — who must NOT be refused', () => {
  it('a learner who has not arrived yet is not a leaver', () => {
    // 205 reserved and 79 enquiry_submitted learners at Engineering alone.
    // They have not left; they have not yet come. Refusing them here would
    // turn one Director decision into a different, unasked-for one — and
    // `reserved` is a status the print guard issues cards for.
    const notYetArrived = [
      'enquiry',
      'enquiry_submitted',
      'pending',
      'approved',
      'account',
      'reserved',
      'admitted',
      'waitlisted',
    ];
    for (const status of notYetArrived) {
      const d = decideScan({ kind: 'learner', lifecycleStatus: status }, [pass()], NOW);
      expect(d.verdict, `status ${status} must not be treated as a leaver`).toBe('approved');
    }
  });

  it('an active learner is unaffected', () => {
    expect(decideScan(STILL_HERE, [pass()], NOW).verdict).toBe('approved');
  });

  it('a learner with no status recorded is not blocked — absence is not evidence', () => {
    for (const status of [null, '', '   ']) {
      const d = decideScan({ kind: 'learner', lifecycleStatus: status }, [pass()], NOW);
      expect(d.verdict).toBe('approved');
    }
  });

  it('an unclassified person passes through to the ordinary pass decision', () => {
    // Administrative and service accounts, and anyone whose record the
    // scanning guard's own RLS scope cannot read.
    expect(decideScan({ kind: 'unclassified' }, [pass()], NOW).verdict).toBe('approved');
    expect(decideScan({ kind: 'unclassified' }, [], NOW).blockedReason).toBe('no_approved_pass');
  });

  it('a team member whose active flag could not be read is not blocked', () => {
    expect(decideScan({ kind: 'team_member', isActive: null }, [pass()], NOW).verdict).toBe(
      'approved'
    );
  });

  it('an active team member is unaffected', () => {
    expect(decideScan({ kind: 'team_member', isActive: true }, [pass()], NOW).verdict).toBe(
      'approved'
    );
  });

  it('a leaver with no pass reads as a leaver, not as "no approved pass"', () => {
    // Both are RED. Telling the guard the wrong one sends them to a warden
    // for a pass that must never be issued.
    const d = decideScan({ kind: 'learner', lifecycleStatus: 'alumni' }, [], NOW);
    expect(d.blockedReason).toBe('has_left');
    expect(d.headline).not.toBe('NO APPROVED PASS');
  });
});

describe('describeDeparture — the one rule both scanners share', () => {
  it('returns null for everyone still here, and a sentence for everyone gone', () => {
    expect(describeDeparture(STILL_HERE)).toBeNull();
    expect(describeDeparture({ kind: 'unclassified' })).toBeNull();
    expect(describeDeparture({ kind: 'learner', lifecycleStatus: 'graduated' })).toContain(
      'graduated'
    );
  });

  it('matches the print guard, so nobody is a leaver at one door and current at the other', () => {
    // Same list as lib/services/id-cards/reprint-eligibility.ts LEAVER_STATUSES.
    const leftAtThePrinter = ['graduated', 'exited', 'inactive', 'withdrawal_pending', 'alumni'];
    for (const status of leftAtThePrinter) {
      expect(describeDeparture({ kind: 'learner', lifecycleStatus: status })).not.toBeNull();
    }
  });

  it('blocked verdicts from the pass rules still carry their own reason', () => {
    expect(decideGateAction([], NOW).blockedReason).toBe('no_approved_pass');
    expect(
      decideGateAction([pass({ status: 'issued', expected_return: DUE_8PM })], NOW).blockedReason
    ).toBe('approved_window_closed');
  });
});
