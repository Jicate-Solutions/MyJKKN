import { describe, it, expect } from 'vitest';
import {
  classifyCardCode,
  decideGateAction,
  formatLateness,
  minutesLate,
  type ScannedPass,
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
