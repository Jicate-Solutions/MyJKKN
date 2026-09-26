/**
 * Two Director rulings of 2026-09-18, pinned as predicates.
 *
 * RULING A — a learner about to say yes is WARNED when they have already said
 * yes to a different drive on the same date. A warning, never a block, so these
 * tests pin what the warning lists and — just as importantly — what it must not
 * list: a withdrawn answer, a different day, the drive itself.
 *
 * RULING B — any CDC team member may reopen ONE declined answer, up to and
 * INCLUDING the drive day; only once that day has passed can nobody. The
 * reopening is
 * recorded in the row's existing `willingness_audit` jsonb, naming the actor,
 * and it is consumed the moment the learner answers again.
 */

import { describe, it, expect } from 'vitest';
import {
  findSameDayClashes,
  canReopenDeclinedResponse,
  isReopenedForLearner,
  driveDayNotPassed,
  istDayKey,
  REOPEN_AUDIT_VIA,
  type ClashCandidate,
} from '@/lib/services/cdc/willingness-service';
import type { CdcDriveWillingness } from '@/types/cdc';

const THIS_DRIVE = { id: 'drive-foxconn', drive_date: '2026-09-17' };

function candidate(over: Partial<ClashCandidate> = {}): ClashCandidate {
  return {
    drive_id: 'drive-indo-mim',
    title: 'INDO-MIM',
    drive_date: '2026-09-17',
    drive_start_time: '10:00:00',
    drive_status: 'willingness_open',
    my_status: 'willing',
    ...over,
  };
}

describe('Ruling A — findSameDayClashes', () => {
  it('flags another drive the learner accepted on the SAME date', () => {
    const clashes = findSameDayClashes(THIS_DRIVE, [candidate()]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].drive_id).toBe('drive-indo-mim');
    expect(clashes[0].title).toBe('INDO-MIM');
    expect(clashes[0].my_status).toBe('willing');
  });

  it('counts a CONFIRMED answer as a clash too — the learner is still going', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ my_status: 'confirmed' })])).toHaveLength(1);
  });

  it('does NOT flag a drive on a different date', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ drive_date: '2026-09-18' })])).toEqual([]);
  });

  it('does NOT flag a WITHDRAWN answer — the learner is not going to that one', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ my_status: 'withdrawn' })])).toEqual([]);
  });

  it('does NOT flag a no_show answer either', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ my_status: 'no_show' })])).toEqual([]);
  });

  it('is never a clash with ITSELF, even on an identical date', () => {
    const self = candidate({ drive_id: THIS_DRIVE.id, title: 'Foxconn India' });
    expect(findSameDayClashes(THIS_DRIVE, [self])).toEqual([]);
  });

  it('returns nothing when THIS drive has no date — an unknown day cannot clash', () => {
    expect(findSameDayClashes({ id: 'drive-foxconn', drive_date: null }, [candidate()])).toEqual([]);
  });

  it('skips an OTHER drive whose date is NULL', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ drive_date: null })])).toEqual([]);
  });

  it('skips a cancelled or closed drive — nobody is attending it', () => {
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ drive_status: 'cancelled' })])).toEqual([]);
    expect(findSameDayClashes(THIS_DRIVE, [candidate({ drive_status: 'closed' })])).toEqual([]);
  });

  it('lists several clashes earliest-first and never twice', () => {
    const clashes = findSameDayClashes(THIS_DRIVE, [
      candidate({ drive_id: 'b', title: 'Later Co', drive_start_time: '14:00:00' }),
      candidate({ drive_id: 'a', title: 'Earlier Co', drive_start_time: '09:00:00' }),
      candidate({ drive_id: 'a', title: 'Earlier Co', drive_start_time: '09:00:00' }),
    ]);
    expect(clashes.map((c) => c.title)).toEqual(['Earlier Co', 'Later Co']);
  });

  it('the production case that prompted the ruling: Foxconn + INDO-MIM, 17 Sep', () => {
    const clashes = findSameDayClashes(
      { id: 'foxconn', drive_date: '2026-09-17' },
      [
        candidate({ drive_id: 'indo-mim', title: 'INDO-MIM', drive_date: '2026-09-17' }),
      ]
    );
    expect(clashes).toHaveLength(1);
  });
});

/** A willingness row in the given state with a plain learner-ui history. */
function declined(
  status: CdcDriveWillingness['status'],
  audit: unknown[] = [{ via: 'learner-ui' }]
): Pick<CdcDriveWillingness, 'status' | 'willingness_audit'> {
  return { status, willingness_audit: audit };
}

describe('Ruling B — canReopenDeclinedResponse', () => {
  const beforeTheDay = new Date('2026-09-16T12:00:00+05:30');
  const onTheDay = new Date('2026-09-17T09:00:00+05:30');
  const afterTheDay = new Date('2026-09-18T09:00:00+05:30');

  it('is ALLOWED before the drive date', () => {
    const r = canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined('withdrawn'), beforeTheDay);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  // THE RULING (Director, 2026-09-18 — "allow on the drive day too"). This was
  // REFUSED before: reopening stopped strictly before the drive date, so a
  // learner who turned up on the morning and asked to be let back in could not
  // be. The boundary is now the END of the drive day, read in Asia/Kolkata.
  it('is ALLOWED on the drive date itself', () => {
    const r = canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined('withdrawn'), onTheDay);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('is ALLOWED late on the drive day — 23:55 IST, which is already the 18th in UTC', () => {
    // 2026-09-17T23:55+05:30 is 2026-09-17T18:25Z. Anything that read the day off
    // the UTC clock would still call this the 17th and pass by luck, so the
    // sharper case is the one below: the first minute of the 18th IST, which is
    // STILL the 17th in UTC and must nonetheless be refused.
    const lateOnTheDay = new Date('2026-09-17T23:55:00+05:30');
    expect(istDayKey(lateOnTheDay)).toBe('2026-09-17');
    expect(
      canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined('withdrawn'), lateOnTheDay).allowed
    ).toBe(true);
  });

  it('is REFUSED from the first minute of the next IST day, though UTC still reads the drive date', () => {
    // 2026-09-18T00:05+05:30 is 2026-09-17T18:35Z. A UTC day key would say
    // '2026-09-17' and wrongly keep reopening open for another 5h25m. The IST
    // key says '2026-09-18' and closes it exactly at IST midnight.
    const justAfterMidnightIst = new Date('2026-09-18T00:05:00+05:30');
    expect(justAfterMidnightIst.toISOString().slice(0, 10)).toBe('2026-09-17'); // what UTC would say
    expect(istDayKey(justAfterMidnightIst)).toBe('2026-09-18'); // what IST says
    const r = canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined('withdrawn'),
      justAfterMidnightIst
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/drive day has passed/i);
  });

  it('is REFUSED the day after the drive date', () => {
    expect(
      canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined('withdrawn'), afterTheDay).allowed
    ).toBe(false);
  });

  it('refuses an answer that is not a decline', () => {
    for (const status of ['willing', 'confirmed', 'no_show'] as const) {
      const r = canReopenDeclinedResponse(
      { drive_date: '2026-09-17', status: 'willingness_open' },
      declined(status), beforeTheDay);
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/only a declined response/i);
    }
  });

  it('allows a drive with no date at all — it has not happened', () => {
    expect(canReopenDeclinedResponse(
      { drive_date: null, status: 'willingness_open' },
      declined('withdrawn'), afterTheDay).allowed).toBe(
      true
    );
  });

  it('reads the day in IST, not UTC — 00:30 IST is already the 16th', () => {
    // 2026-09-15T19:00:00Z is 2026-09-16 00:30 IST. A UTC reading would call it
    // the 15th, which would leave a 15 Sep drive reopenable after its day ended.
    const justPastMidnightIst = new Date('2026-09-15T19:00:00Z');
    expect(istDayKey(justPastMidnightIst)).toBe('2026-09-16');
    // The 16th itself: still open, because the day has not passed.
    expect(driveDayNotPassed('2026-09-16', justPastMidnightIst)).toBe(true);
    // The 15th: closed — in IST that day is over, even though UTC still reads it.
    expect(driveDayNotPassed('2026-09-15', justPastMidnightIst)).toBe(false);
  });

  it('keeps a drive with no date reopenable', () => {
    expect(driveDayNotPassed(null, afterTheDay)).toBe(true);
  });
});

describe('Ruling B — isReopenedForLearner (the audit entry IS the state)', () => {
  const now = new Date('2026-09-16T12:00:00+05:30');
  const drive = { drive_date: '2026-09-17', status: 'willingness_open' as const };

  function row(audit: unknown[], status: CdcDriveWillingness['status'] = 'withdrawn') {
    return { status, willingness_audit: audit } as Pick<
      CdcDriveWillingness,
      'status' | 'willingness_audit'
    >;
  }

  const reopenEntry = {
    at: '2026-09-16T06:30:00.000Z',
    actor: 'cdc-user-1',
    from_status: 'withdrawn',
    to_status: 'withdrawn',
    via: REOPEN_AUDIT_VIA,
  };

  it('is true right after CDC reopened it', () => {
    expect(isReopenedForLearner(row([{ via: 'learner-ui' }, reopenEntry]), drive, now)).toBe(true);
  });

  it('records WHO reopened it', () => {
    expect(reopenEntry.actor).toBe('cdc-user-1');
    expect(reopenEntry.via).toBe('cdc-reopen');
  });

  it('is false once the learner has answered again — their entry supersedes it', () => {
    expect(
      isReopenedForLearner(
        row([reopenEntry, { at: '2026-09-16T07:00:00.000Z', via: 'learner-ui' }]),
        drive,
        now
      )
    ).toBe(false);
  });

  it('is false with no audit at all, and with a non-array audit', () => {
    expect(isReopenedForLearner(row([]), drive, now)).toBe(false);
    expect(
      isReopenedForLearner(
        { status: 'withdrawn', willingness_audit: null as unknown as unknown[] },
        drive,
        now
      )
    ).toBe(false);
  });

  it('is false for a learner who never answered', () => {
    expect(isReopenedForLearner(null, drive, now)).toBe(false);
  });

  it('still holds ON the drive day — the learner can act on the morning of the drive', () => {
    // Mirrors the ruling on the CDC side: if a team member may reopen on the day,
    // the learner they reopened it for must be able to answer on the day. If these
    // two ever disagree, a learner is shown an open door the server refuses.
    expect(
      isReopenedForLearner(row([reopenEntry]), drive, new Date('2026-09-17T09:00:00+05:30'))
    ).toBe(true);
    expect(
      isReopenedForLearner(row([reopenEntry]), drive, new Date('2026-09-17T23:55:00+05:30'))
    ).toBe(true);
  });

  it('expires once the drive day has passed — a stale reopening does not outlive the drive', () => {
    expect(
      isReopenedForLearner(row([reopenEntry]), drive, new Date('2026-09-18T00:05:00+05:30'))
    ).toBe(false);
  });

  it('does not apply to an answer that is not a decline', () => {
    expect(isReopenedForLearner(row([reopenEntry], 'willing'), drive, now)).toBe(false);
  });
});

describe('Ruling B repair — a reopen respects the drive status (review, 2026-09-24)', () => {
  const now = new Date('2026-09-16T12:00:00+05:30');
  const reopenEntry = { at: '2026-09-16T06:30:00.000Z', actor: 'cdc-user-1', via: REOPEN_AUDIT_VIA };

  it('refuses to reopen on a cancelled or closed drive, even before its date', () => {
    for (const status of ['cancelled', 'closed'] as const) {
      const r = canReopenDeclinedResponse(
        { drive_date: '2026-09-17', status },
        declined('withdrawn'),
        now
      );
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(new RegExp(`drive is ${status}`));
    }
  });

  it('still allows every other live drive status', () => {
    for (const status of ['announced', 'willingness_open', 'eligibility_locked', 'attendance_day'] as const) {
      expect(
        canReopenDeclinedResponse({ drive_date: '2026-09-17', status }, declined('withdrawn'), now)
          .allowed
      ).toBe(true);
    }
  });

  it('drops a standing reopening once the drive is cancelled or closed — the learner cannot say yes to it', () => {
    const r = declined('withdrawn', [{ via: 'learner-ui' }, reopenEntry]);
    expect(
      isReopenedForLearner(r, { drive_date: '2026-09-17', status: 'willingness_open' }, now)
    ).toBe(true);
    expect(isReopenedForLearner(r, { drive_date: '2026-09-17', status: 'cancelled' }, now)).toBe(
      false
    );
    expect(isReopenedForLearner(r, { drive_date: '2026-09-17', status: 'closed' }, now)).toBe(
      false
    );
  });
});

describe('Ruling B repair — a reopening is granted once (review, 2026-09-24)', () => {
  const now = new Date('2026-09-16T12:00:00+05:30');
  const drive = { drive_date: '2026-09-17', status: 'willingness_open' as const };
  const reopenEntry = { at: '2026-09-16T06:30:00.000Z', actor: 'cdc-user-1', via: REOPEN_AUDIT_VIA };

  it('refuses a second reopen while the first is still standing', () => {
    const r = canReopenDeclinedResponse(
      drive,
      declined('withdrawn', [{ via: 'learner-ui' }, reopenEntry]),
      now
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/already reopened/i);
  });

  it('allows a fresh reopen once the learner used the first one and declined again', () => {
    const r = canReopenDeclinedResponse(
      drive,
      declined('withdrawn', [reopenEntry, { via: 'learner-ui' }]),
      now
    );
    expect(r.allowed).toBe(true);
  });
});
