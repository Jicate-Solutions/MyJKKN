import { describe, it, expect } from 'vitest';
import {
  WALKIN_WORKLIST_URL,
  buildWalkinClaimsNote,
  isoWeekKey,
  noteIdempotencyKey,
  resolveRecipients,
} from '@/lib/services/admission/walkin-claims-weekly-note';

const DIRECTOR = 'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1';
const OWNER = '11111111-2222-3333-4444-555555555555';

describe('isoWeekKey — one note per ISO week on the Indian calendar', () => {
  it('names the ISO week of an ordinary Monday', () => {
    // Monday 28 Sep 2026, 09:15 IST = 03:45 UTC.
    expect(isoWeekKey(new Date('2026-09-28T03:45:00Z'))).toBe('2026-W40');
  });

  it('keeps Monday to Sunday of one week on the same key', () => {
    const monday = isoWeekKey(new Date('2026-09-28T03:45:00Z'));
    const sunday = isoWeekKey(new Date('2026-10-04T12:00:00Z'));
    expect(sunday).toBe(monday);
  });

  it('reads the date in IST, not UTC — Sunday 20:00 UTC is already Monday in India', () => {
    // 2026-10-04 20:00 UTC = 2026-10-05 01:30 IST (Monday of the next week).
    expect(isoWeekKey(new Date('2026-10-04T20:00:00Z'))).toBe('2026-W41');
    // 2026-10-04 18:00 UTC = 23:30 IST Sunday, still the old week.
    expect(isoWeekKey(new Date('2026-10-04T18:00:00Z'))).toBe('2026-W40');
  });

  it('puts the first days of January in the previous ISO year when the week says so', () => {
    // Fri 1 Jan 2027 belongs to ISO week 53 of 2026.
    expect(isoWeekKey(new Date('2027-01-01T06:00:00Z'))).toBe('2026-W53');
    // Mon 4 Jan 2027 starts 2027-W01.
    expect(isoWeekKey(new Date('2027-01-04T06:00:00Z'))).toBe('2027-W01');
  });

  it('keys the bell row per person and per week', () => {
    expect(noteIdempotencyKey('2026-W40', DIRECTOR)).toBe(
      `walkin-claims-weekly-note:2026-W40:${DIRECTOR}`,
    );
    expect(noteIdempotencyKey('2026-W40', DIRECTOR)).not.toBe(noteIdempotencyKey('2026-W40', OWNER));
    expect(noteIdempotencyKey('2026-W40', DIRECTOR)).not.toBe(noteIdempotencyKey('2026-W41', DIRECTOR));
  });
});

describe('buildWalkinClaimsNote', () => {
  it('writes the subject the Director asked for', () => {
    const note = buildWalkinClaimsNote({
      waiting: 352,
      oldestWaitingAt: '2026-05-12T05:30:00Z',
      releasedLast7Days: 0,
    });
    expect(note.subject).toBe('Walk-in agency claims: 352 waiting, oldest 12 May');
    expect(note.text).toContain('352 walk-in agency claims are waiting');
    expect(note.text).toContain('since 12 May 2026');
    expect(note.text).toContain('None were released in the last 7 days.');
    expect(note.text).toContain(WALKIN_WORKLIST_URL);
    expect(note.html).toContain(`href="${WALKIN_WORKLIST_URL}"`);
  });

  it('uses the Indian date for the oldest claim', () => {
    // 11 May 20:00 UTC is already 12 May in India.
    const note = buildWalkinClaimsNote({
      waiting: 3,
      oldestWaitingAt: '2026-05-11T20:00:00Z',
      releasedLast7Days: 1,
    });
    expect(note.subject).toBe('Walk-in agency claims: 3 waiting, oldest 12 May');
    expect(note.text).toContain('1 was released in the last 7 days.');
  });

  it('handles singular and plural', () => {
    const one = buildWalkinClaimsNote({ waiting: 1, oldestWaitingAt: '2026-05-12T05:30:00Z', releasedLast7Days: 4 });
    expect(one.text).toContain('1 walk-in agency claim is waiting');
    expect(one.text).toContain('4 were released in the last 7 days.');
  });

  it('still says something when nothing is waiting, so a quiet week is not a silent job', () => {
    const note = buildWalkinClaimsNote({ waiting: 0, oldestWaitingAt: null, releasedLast7Days: 12 });
    expect(note.subject).toBe('Walk-in agency claims: none waiting');
    expect(note.text).toContain('No walk-in agency claims are waiting');
    expect(note.text).toContain('12 were released in the last 7 days.');
  });

  it('never mentions money', () => {
    const note = buildWalkinClaimsNote({ waiting: 352, oldestWaitingAt: '2026-05-12T05:30:00Z', releasedLast7Days: 0 });
    for (const part of [note.subject, note.text, note.html]) {
      expect(part).not.toMatch(/₹|\bRs\.?\b|\bINR\b|rupee/i);
    }
  });
});

describe('resolveRecipients', () => {
  it('adds the owner to the configured list', () => {
    const r = resolveRecipients([DIRECTOR], OWNER);
    expect(r.userIds).toEqual([DIRECTOR, OWNER]);
    expect(r.ownerMissing).toBe(false);
  });

  it('does not send twice when the owner is also listed', () => {
    const r = resolveRecipients([DIRECTOR, OWNER], OWNER.toUpperCase());
    expect(r.userIds).toEqual([DIRECTOR, OWNER]);
  });

  it('copes with a missing owner row', () => {
    const r = resolveRecipients([DIRECTOR], null);
    expect(r.userIds).toEqual([DIRECTOR]);
    expect(r.ownerMissing).toBe(true);
  });

  it('drops malformed entries and reports them instead of throwing', () => {
    const r = resolveRecipients([DIRECTOR, 'not-a-uuid', 42, null], 'also-bad');
    expect(r.userIds).toEqual([DIRECTOR]);
    expect(r.invalidEntries).toBe(3);
    expect(r.ownerMissing).toBe(true);
  });

  it('still reaches the owner when the list row is missing', () => {
    const r = resolveRecipients(null, OWNER);
    expect(r.userIds).toEqual([OWNER]);
  });
});
