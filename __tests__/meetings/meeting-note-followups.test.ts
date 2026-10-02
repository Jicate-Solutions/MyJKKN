// __tests__/meetings/meeting-note-followups.test.ts
//
// The shared follow-up path for meeting notes (lib/services/meetings/
// meeting-note-followups.ts): the parser moved out of the ingest route must
// behave exactly as before, a note Fireflies has not summarised is not stamped,
// the booking's host/attendee become owner candidates under the same
// exactly-one rule (names compared with spacing set aside), due dates come only
// from explicit calendar dates inside the meeting's window, follow-ups land only
// on the booking the note is linked to NOW, the HR interview record is filled
// only through the calendar match, the hand-link applies once, and owners
// (never the host) get one bell each — signed by the system account, never by
// the host, and naming no booking.
//
// All fixtures are invented; no real meeting content and no real names. The
// two name shapes in section 2 mirror the live mismatches the review measured.

import { readFileSync } from 'fs';
import path from 'path';

import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { FirefliesTranscript } from '@/lib/services/meetings/fireflies-client';

const bell = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  keys: new Set<string>(),
  // true → also run the REAL fanoutNotification against the fake database, so
  // a test can read the notifications row itself (created_by, metadata).
  real: false,
}));

vi.mock('@/lib/services/_shared/notifications/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/_shared/notifications/notify')>();
  return {
    fanoutNotification: vi.fn(async (db: unknown, opts: Record<string, unknown>) => {
      if (bell.real) {
        bell.calls.push(opts);
        return actual.fanoutNotification(db as never, opts as never);
      }
      const key = opts.idempotencyKey as string | undefined;
      // the DB's unique index on notifications.idempotency_key
      if (key && bell.keys.has(key)) return { notified: 0, skipped: 'idempotent' };
      if (key) bell.keys.add(key);
      bell.calls.push(opts);
      return { notified: (opts.userIds as string[]).length, notificationId: `notif-${bell.calls.length}` };
    }),
  };
});

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

const fireflies = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock('@/lib/services/meetings/fireflies-client', () => ({
  isFirefliesConfigured: () => true,
  fetchRecentFirefliesTranscripts: async () => ({ ok: true, data: fireflies.data }),
}));

import {
  applyNoteToBooking,
  nameKeys,
  nameTokens,
  noteFollowupInputFromStored,
  parseActionItems,
  parseExplicitDueDate,
  resolveOwnerProfileId,
  type NoteFollowupInput,
} from '@/lib/services/meetings/meeting-note-followups';

// ── a tiny in-memory Supabase ────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let insertSeq = 0;

// `failReads` lists tables whose SELECTs come back as an error, the way a
// timeout or a dropped connection would. "table.column" fails only the reads
// that filter on that column (e.g. 'profiles.is_super_admin' fails the
// system-account lookup and no other profiles read).
function fakeClient(db: Db, failReads: string[] = []) {
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const sorts: Array<[string, boolean]> = [];
    const eqColumns: string[] = [];
    const failing = () =>
      failReads.includes(table) || eqColumns.some((c) => failReads.includes(`${table}.${c}`));
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const rows = () => {
      const out = (db[table] ??= []).filter((r) => filters.every((f) => f(r)));
      for (const [c, asc] of [...sorts].reverse()) {
        out.sort((x, y) => String(x[c] ?? '').localeCompare(String(y[c] ?? '')) * (asc ? 1 : -1));
      }
      return out;
    };
    const run = () => {
      if (mode === 'insert') {
        for (const r of inserted) if (r.id === undefined) r.id = `${table}-${++insertSeq}`;
        (db[table] ??= []).push(...inserted);
        return { data: inserted, error: null };
      }
      if (mode === 'update') {
        for (const r of rows()) Object.assign(r, patch);
        return { data: null, error: null };
      }
      if (failing()) return { data: null, error: { message: 'read timed out' } };
      return { data: rows(), error: null };
    };
    const one = async () => {
      if (mode === 'select' && failing()) {
        return { data: null, error: { message: 'read timed out' } };
      }
      if (mode === 'select') return { data: rows()[0] ?? null, error: null };
      const out = run();
      return { data: Array.isArray(out.data) ? (out.data[0] ?? null) : null, error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (eqColumns.push(c), filters.push((r) => r[c] === v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      order: (c: string, o?: { ascending?: boolean }) => (sorts.push([c, o?.ascending !== false]), b),
      limit: () => b,
      insert: (r: Row | Row[]) => ((mode = 'insert'), (inserted = Array.isArray(r) ? r : [r]), b),
      update: (p: Row) => ((mode = 'update'), (patch = p), b),
      upsert: () => b,
      maybeSingle: one,
      single: one,
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(ok, bad),
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as never;
}

const HOST = 'p-host';
const ATTENDEE = 'p-attendee';
const OTHER = 'p-other';
// The system account a machine-sent bell is signed with (the earliest super
// admin — app/api/cron/learner-risk-notifications/route.ts).
const SYSTEM = 'p-system';

function baseDb(overrides: Partial<Db> = {}): Db {
  return {
    meeting_notes: [{ id: 'n1', booking_id: 'b1', action_items_applied_at: null }],
    meeting_bookings: [{ id: 'b1', host_profile_id: HOST, attendee_profile_id: ATTENDEE }],
    profiles: [
      { id: HOST, email: 'host@example.test', full_name: 'Aravind Kumaran' },
      { id: ATTENDEE, email: 'visitor@example.test', full_name: 'Prof. Dr. Selvi Rajendran' },
      { id: OTHER, email: 'other@example.test', full_name: 'Bharathi Natarajan' },
      {
        id: SYSTEM,
        email: 'system@example.test',
        full_name: 'Campus Office',
        is_super_admin: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    meeting_action_items: [],
    meeting_note_participants: [],
    hr_recruitment_interviews: [],
    ...overrides,
  };
}

function input(over: Partial<NoteFollowupInput> = {}): NoteFollowupInput {
  return {
    title: 'Weekly review',
    summary: 'We reviewed the plan.',
    actionItemsRaw: null,
    occurredAt: '2026-09-20T05:00:00.000Z',
    durationMinutes: 30,
    participants: [],
    ...over,
  };
}

function blankInterview(bookingId: string, id = `i-${bookingId}`): Row {
  return { id, booking_id: bookingId, outcome_summary: null, duration_minutes: null };
}

beforeEach(() => {
  bell.calls.length = 0;
  bell.keys.clear();
  bell.real = false;
});

// ── 1. parser parity with the code that used to live in the route ───────────

// Verbatim copy of the pre-move inline implementation (route.ts @ 50efe8e075).
function oldParseActionItems(raw: string | null) {
  if (!raw) return [];
  const OWNER_LINE = /^\*\*(.+?)\*\*:?\s*$/;
  const TRAILING_TIMESTAMP = /\s*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*$/;
  const out: Array<{ ownerName: string | null; text: string }> = [];
  let owner: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = OWNER_LINE.exec(trimmed);
    if (m) {
      owner = m[1].trim() || null;
      continue;
    }
    const text = trimmed.replace(/^[-*•]\s*/, '').replace(TRAILING_TIMESTAMP, '').trim();
    if (!text) continue;
    out.push({ ownerName: owner, text: text.slice(0, 500) });
  }
  return out;
}

const FIXTURES: Array<string | null> = [
  null,
  '',
  '**Person One**\nPrepare the room list (18:18)\n\n**Person Two, Director**\nCall the office about the visit (19:00)\nShare the draft (1:02:03)',
  '- Send the minutes\n* Book the hall\n• Confirm the bus',
  '**Solo Speaker**:\n\n\n   Do the thing   \r\n(12:00)\n**  **\nOrphan after blank owner',
  `**Long**\n${'x'.repeat(700)}`,
];

describe('parseActionItems — parity with the old inline parser', () => {
  it.each(FIXTURES.map((f, i) => [i, f]))('fixture %i parses identically', (_i, raw) => {
    expect(parseActionItems(raw as string | null)).toEqual(oldParseActionItems(raw as string | null));
  });

  it('strips titles from name tokens as before', () => {
    expect(nameTokens('Prof. Dr. T. Selvi')).toEqual(['selvi']);
  });
});

// ── 2. the exactly-one owner rule ────────────────────────────────────────────

describe('resolveOwnerProfileId', () => {
  it('picks the one person sharing a distinctive token', () => {
    const people = [
      { profileId: 'a', names: ['Selvi Rajendran'] },
      { profileId: 'b', names: ['Bharathi Natarajan'] },
    ];
    expect(resolveOwnerProfileId('Selvi R', people)).toBe('a');
  });

  it('returns null when two different people qualify', () => {
    const people = [
      { profileId: 'a', names: ['Selvi Rajendran'] },
      { profileId: 'b', names: ['Selvi Kannan'] },
    ];
    expect(resolveOwnerProfileId('Selvi', people)).toBeNull();
  });

  it('counts one person listed twice (participant + host) as one', () => {
    const people = [
      { profileId: 'a', names: ['Selvi R'] },
      { profileId: 'a', names: ['Selvi Rajendran'] },
    ];
    expect(resolveOwnerProfileId('Selvi', people)).toBe('a');
  });

  it('never matches on short tokens or no name', () => {
    expect(resolveOwnerProfileId('T R', [{ profileId: 'a', names: ['T R'] }])).toBeNull();
    expect(resolveOwnerProfileId(null, [{ profileId: 'a', names: ['Selvi'] }])).toBeNull();
  });
});

describe('resolveOwnerProfileId — spacing, dots, "Dr" and case set aside', () => {
  it('joins consecutive name words, after titles and initials are dropped', () => {
    expect(nameKeys('Dr. Ravi Kumar S')).toEqual(['ravi', 'ravikumar', 'kumar']);
    expect(nameKeys('KALAPRIYA M.R')).toEqual(['kalapriya']);
  });

  it('"Ravikumar S" is "RAVI KUMAR S" (the words run together in one of them)', () => {
    const people = [
      { profileId: 'a', names: ['RAVI KUMAR S'] },
      { profileId: 'b', names: ['Bharathi Natarajan'] },
    ];
    expect(resolveOwnerProfileId('Ravikumar S', people)).toBe('a');
  });

  it('"Dr Kala Priya" / "Dr. Kala Priya" is "KALAPRIYA M.R"', () => {
    const people = [
      { profileId: 'a', names: ['KALAPRIYA M.R'] },
      { profileId: 'b', names: ['Bharathi Natarajan'] },
    ];
    expect(resolveOwnerProfileId('Dr Kala Priya', people)).toBe('a');
    expect(resolveOwnerProfileId('Dr. Kala Priya', people)).toBe('a');
  });

  it('still chooses nobody when the new comparison fits two different people', () => {
    expect(
      resolveOwnerProfileId('Dr Kala Priya', [
        { profileId: 'a', names: ['KALAPRIYA M.R'] },
        { profileId: 'b', names: ['Kala Priya S'] },
      ]),
    ).toBeNull();
    expect(
      resolveOwnerProfileId('Ravikumar', [
        { profileId: 'a', names: ['RAVI KUMAR S'] },
        { profileId: 'b', names: ['Ravi Kumar T'] },
      ]),
    ).toBeNull();
  });

  it('is never a partial match: part of a joined name is not the name', () => {
    expect(resolveOwnerProfileId('Kala', [{ profileId: 'a', names: ['KALAPRIYA M.R'] }])).toBeNull();
    expect(resolveOwnerProfileId('Ravi', [{ profileId: 'a', names: ['RAVIKUMAR S'] }])).toBeNull();
  });
});

// ── 3. due dates: explicit, inside the meeting's window, or nothing ─────────

describe('parseExplicitDueDate', () => {
  const MEETING = '2026-09-20T05:00:00.000Z'; // 20 Sep 2026, 10:30 on campus

  it.each([
    ['Send the report by 30 Sep', '2026-09-30'],
    ['Send the report by 30th September', '2026-09-30'],
    ['Send the report by 30/09/2026', '2026-09-30'],
    ['Send the report by 30-09-2026', '2026-09-30'],
    ['Send the report by September 30', '2026-09-30'],
    ['Send the report by Sep 30th, 2026', '2026-09-30'],
    ['Send the report by 2026-10-02', '2026-10-02'],
    ['Close it the same day, 20 Sep', '2026-09-20'], // the meeting day itself
    ['Renew the licence by 19/03/2027', '2027-03-19'], // day 180 — the last one
  ])('reads %j as %s', (text, want) => {
    expect(parseExplicitDueDate(text, MEETING)).toBe(want);
  });

  it.each([
    'Send it tomorrow',
    'Follow up in two days',
    'Share the plan next week',
    'Call back by Friday',
    'Revise within one to two months',
    'Collect 2 marks from each learner',
    'We may 2x the intake', // lower-case "may" is the verb
    'Meet at 10.30 in the hall (19:00)',
    'Between 3 Oct and 10 Oct', // two different dates — which one?
    'File by 31 Feb', // impossible
    'File by 13/13/2026',
    '',
  ])('sets nothing for %j', (text) => {
    expect(parseExplicitDueDate(text, MEETING)).toBeNull();
  });

  it.each([
    // The review's probe: a past event named in the item, not its deadline.
    'Share the minutes of the 15 Sep review',
    'Reply to the 12/09/2026 letter',
    // Year-less and before the meeting day in its own year: never rolled on.
    'Book the hall for 5 Jan',
    'Book the hall for May 4',
    // Too far out to be this meeting's follow-up.
    'Send the report by Sep 30th, 2027',
    'Renew the licence by 20/03/2027', // day 181
    // A past date beside a future one is still two dates.
    'Share the minutes of the 15 Sep review by 30 Sep',
  ])('sets nothing for a date outside the meeting window: %j', (text) => {
    expect(parseExplicitDueDate(text, MEETING)).toBeNull();
  });

  it('sets nothing when the meeting date is unknown — nothing to check the date against', () => {
    expect(parseExplicitDueDate('by 30 Sep', null)).toBeNull();
    expect(parseExplicitDueDate('by 30/09/2026', null)).toBeNull();
  });

  it('never rolls a year-less date into next year, even across New Year', () => {
    const DEC_MEETING = '2026-12-20T05:00:00.000Z';
    expect(parseExplicitDueDate('by 5 Jan', DEC_MEETING)).toBeNull();
    expect(parseExplicitDueDate('by 05/01/2027', DEC_MEETING)).toBe('2027-01-05');
  });

  it('reads the meeting day in campus time, not UTC', () => {
    // 21 Sep 20:00 UTC is already 22 Sep on campus: 21 Sep has passed.
    expect(parseExplicitDueDate('by 21 Sep', '2026-09-21T20:00:00.000Z')).toBeNull();
    expect(parseExplicitDueDate('by 22 Sep', '2026-09-21T20:00:00.000Z')).toBe('2026-09-22');
  });
});

// ── 4. applyNoteToBooking ────────────────────────────────────────────────────

describe('applyNoteToBooking', () => {
  it('does NOT stamp a note Fireflies has not summarised yet', async () => {
    const db = baseDb();
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input({ summary: null }));
    expect(db.meeting_notes[0].action_items_applied_at).toBeNull();
    expect(db.meeting_action_items).toHaveLength(0);
  });

  it('stamps a summarised note even when it had no follow-ups', async () => {
    const db = baseDb();
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input());
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('stamps a note that produced follow-ups even with no overview, so they are not recreated', async () => {
    const db = baseDb();
    const client = fakeClient(db);
    const note = input({ summary: null, actionItemsRaw: '- Send the minutes' });
    await applyNoteToBooking(client, 'n1', 'b1', note);
    await applyNoteToBooking(client, 'n1', 'b1', note);
    expect(db.meeting_action_items).toHaveLength(1);
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('writes nothing when the note is no longer linked to that booking (a human unlinked it)', async () => {
    const db = baseDb({ meeting_notes: [{ id: 'n1', booking_id: null, action_items_applied_at: null }] });
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input({ actionItemsRaw: '**Selvi**\nSend the draft' }));
    expect(db.meeting_action_items).toHaveLength(0);
    expect(bell.calls).toHaveLength(0);
    expect(db.meeting_notes[0].action_items_applied_at).toBeNull();
  });

  it('writes nothing onto a booking other than the one the note is linked to now', async () => {
    const db = baseDb({ meeting_notes: [{ id: 'n1', booking_id: 'b2', action_items_applied_at: null }] });
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input({ actionItemsRaw: '- Send the draft' }));
    expect(db.meeting_action_items).toHaveLength(0);
  });

  it('fills the HR interview record only when the booking came from the calendar match', async () => {
    const handLinked = baseDb({ hr_recruitment_interviews: [blankInterview('b1')] });
    await applyNoteToBooking(fakeClient(handLinked), 'n1', 'b1', input());
    expect(handLinked.hr_recruitment_interviews[0]).toMatchObject({
      outcome_summary: null,
      duration_minutes: null,
    });

    const explicitNo = baseDb({ hr_recruitment_interviews: [blankInterview('b1')] });
    await applyNoteToBooking(fakeClient(explicitNo), 'n1', 'b1', input(), { calendarMatched: false });
    expect(explicitNo.hr_recruitment_interviews[0].outcome_summary).toBeNull();

    const matched = baseDb({ hr_recruitment_interviews: [blankInterview('b1')] });
    await applyNoteToBooking(fakeClient(matched), 'n1', 'b1', input(), { calendarMatched: true });
    expect(matched.hr_recruitment_interviews[0]).toMatchObject({
      outcome_summary: 'We reviewed the plan.',
      duration_minutes: 30,
    });
  });

  it('uses the booking host and attendee as owner candidates (no Fireflies emails)', async () => {
    const db = baseDb();
    await applyNoteToBooking(
      fakeClient(db),
      'n1',
      'b1',
      input({
        actionItemsRaw:
          '**Selvi R**\nSend the room plan draft by 30 Sep\n**Aravind**\nBook the hall\n**Someone Else**\nCall the vendor',
      }),
    );
    const items = db.meeting_action_items;
    expect(items.map((i) => i.owner_profile_id)).toEqual([ATTENDEE, HOST, null]);
    expect(items.map((i) => i.due_date)).toEqual(['2026-09-30', null, null]);
    expect(items.every((i) => i.host_profile_id === HOST && i.booking_id === 'b1')).toBe(true);
  });

  it('matches an attendee whose profile writes the name with different spacing', async () => {
    const db = baseDb({
      profiles: [
        { id: HOST, email: 'host@example.test', full_name: 'Aravind Kumaran' },
        { id: ATTENDEE, email: 'visitor@example.test', full_name: 'RAVI KUMAR S' },
      ],
    });
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input({ actionItemsRaw: '**Ravikumar S**\nSend the draft' }));
    expect(db.meeting_action_items[0].owner_profile_id).toBe(ATTENDEE);
  });

  it('still refuses when a name fits a participant AND the attendee who are different people', async () => {
    const db = baseDb({
      profiles: [
        { id: HOST, email: 'host@example.test', full_name: 'Aravind Kumaran' },
        { id: ATTENDEE, email: 'visitor@example.test', full_name: 'Selvi Rajendran' },
        { id: OTHER, email: 'other@example.test', full_name: 'Selvi Natarajan' },
      ],
    });
    await applyNoteToBooking(
      fakeClient(db),
      'n1',
      'b1',
      input({
        actionItemsRaw: '**Selvi**\nSend the draft',
        participants: [{ email: 'other@example.test', displayName: 'Selvi N' }],
      }),
    );
    expect(db.meeting_action_items[0].owner_profile_id).toBeNull();
  });

  it('bells each non-host owner once, never the host, idempotent per (note, owner)', async () => {
    const db = baseDb();
    const note = input({
      actionItemsRaw: '**Selvi**\nFirst task\nSecond task\n**Aravind**\nHost task',
    });
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', note);

    expect(bell.calls).toHaveLength(1);
    expect(bell.calls[0]).toMatchObject({
      userIds: [ATTENDEE],
      createdBy: SYSTEM,
      url: '/meetings/action-items',
      category: 'meetings:note-followup-owner',
      priority: 'high',
      idempotencyKey: `meetings:note-followup-owner:n1:${ATTENDEE}`,
    });
    expect(bell.calls[0].metadata).toEqual({ item_count: 2 });

    // A second pass that got past the stamp (e.g. a retried run) cannot bell twice.
    db.meeting_notes[0].action_items_applied_at = null;
    db.meeting_action_items.length = 0;
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', note);
    expect(bell.calls).toHaveLength(1);
  });

  it('marks every follow-up it writes as source fireflies', async () => {
    const db = baseDb();
    const outcome = await applyNoteToBooking(
      fakeClient(db),
      'n1',
      'b1',
      input({ actionItemsRaw: '**Selvi**\nFirst task\n**Aravind**\nHost task\n- Unowned task' }),
    );
    expect(outcome).toBe('applied');
    expect(db.meeting_action_items).toHaveLength(3);
    expect(db.meeting_action_items.map((i) => i.source)).toEqual(['fireflies', 'fireflies', 'fireflies']);
  });

  // Owners come from Fireflies' attendee list; the note itself is readable only
  // by admins, the host, co-hosts and the booking's own attendee
  // (fn_can_view_meeting_note). Whatever the bell says reaches people the note
  // is hidden from, so it says nothing taken from the note or its booking.
  it('the bell for an owner found only on the Fireflies attendee list carries no note title, date or name', async () => {
    const db = baseDb();
    await applyNoteToBooking(
      fakeClient(db),
      'n1',
      'b1',
      input({
        title: 'Interview X - not selected',
        actionItemsRaw: '**Bharathi**\nSend the report',
        participants: [{ email: 'other@example.test', displayName: 'Bharathi N' }],
      }),
    );

    // OTHER is neither the host nor the booking's attendee: a participant only.
    expect(db.meeting_action_items[0].owner_profile_id).toBe(OTHER);
    expect(bell.calls).toHaveLength(1);
    expect(bell.calls[0]).toMatchObject({
      userIds: [OTHER],
      title: 'New follow-up for you',
      body: '1 follow-up from a recorded meeting was added to your list.',
    });
    const sent = JSON.stringify(bell.calls[0]);
    expect(sent).not.toContain('Interview X');
    expect(sent).not.toContain('not selected');
    expect(sent).not.toMatch(/2026-09-20|20 Sep/);
    expect(sent).not.toMatch(/Bharathi|Aravind|Selvi|Natarajan|Kumaran|Rajendran/);
  });

  it('no owner’s bell ever carries the note’s title, for any title and every owner', async () => {
    for (const title of ['Interview X - not selected', 'Salary revision: two names', 'Weekly review']) {
      bell.calls.length = 0;
      bell.keys.clear();
      const db = baseDb();
      await applyNoteToBooking(
        fakeClient(db),
        'n1',
        'b1',
        input({
          title,
          actionItemsRaw: '**Selvi**\nFirst task\nSecond task\n**Bharathi**\nThird task\n**Aravind**\nHost task',
          participants: [{ email: 'other@example.test', displayName: 'Bharathi N' }],
        }),
      );

      // the booking's attendee (two items) and a participant-only owner (one)
      expect(bell.calls.map((c) => (c.userIds as string[])[0]).sort()).toEqual([ATTENDEE, OTHER].sort());
      for (const call of bell.calls) {
        expect(JSON.stringify(call)).not.toContain(title);
      }
      expect(bell.calls.find((c) => (c.userIds as string[])[0] === ATTENDEE)).toMatchObject({
        title: 'New follow-ups for you',
        body: '2 follow-ups from a recorded meeting were added to your list.',
      });
    }
  });

  it('sends no bell when every item is unowned or the host’s', async () => {
    const db = baseDb();
    await applyNoteToBooking(
      fakeClient(db),
      'n1',
      'b1',
      input({ actionItemsRaw: '- Unowned task\n**Aravind Kumaran**\nHost task' }),
    );
    expect(db.meeting_action_items).toHaveLength(2);
    expect(bell.calls).toHaveLength(0);
  });

  // Round 5. The recipient can SELECT their own notifications row and any
  // profile's full_name. created_by = the host plus a booking id in metadata
  // would tell an owner found only on Fireflies' attendee list who hosts a
  // meeting they cannot see. These read the row the REAL notifier writes.
  describe('the bell row names neither the host nor the booking (round 5)', () => {
    const mixed = '**Selvi**\nFirst task\nSecond task\n**Bharathi**\nThird task\n**Aravind**\nHost task';
    const participantOnly = [{ email: 'other@example.test', displayName: 'Bharathi N' }];

    it('no owner’s notifications row carries the host id anywhere, nor the booking id', async () => {
      bell.real = true;
      const db = baseDb();
      await applyNoteToBooking(
        fakeClient(db),
        'n1',
        'b1',
        input({ actionItemsRaw: mixed, participants: participantOnly }),
      );

      const rows = db.notifications ?? [];
      const recipient = (r: Row) => (r.targeting as { user_ids: string[] }).user_ids[0];
      // the booking's attendee and an owner found only on the attendee list
      expect(rows.map(recipient).sort()).toEqual([ATTENDEE, OTHER].sort());
      for (const row of rows) {
        expect(row.created_by).toBe(SYSTEM);
        expect(JSON.stringify(row)).not.toContain(HOST);
        expect(JSON.stringify(row)).not.toContain('"b1"');
        expect(JSON.stringify(row)).not.toMatch(/booking/i);
      }
      expect(rows.find((r) => recipient(r) === OTHER)?.metadata).toEqual({
        source: 'meetings/note-followups',
        item_count: 1,
      });
      expect(rows.find((r) => recipient(r) === ATTENDEE)?.metadata).toEqual({
        source: 'meetings/note-followups',
        item_count: 2,
      });
    });

    it('is signed by the system account: the EARLIEST super admin, as the cron alerts are', async () => {
      const db = baseDb();
      db.profiles = [
        ...db.profiles.filter((p) => p.id !== SYSTEM),
        {
          id: 'p-later-admin',
          email: 'later@example.test',
          full_name: 'Later Admin',
          is_super_admin: true,
          created_at: '2025-06-01T00:00:00Z',
        },
        {
          id: SYSTEM,
          email: 'system@example.test',
          full_name: 'Campus Office',
          is_super_admin: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      await applyNoteToBooking(
        fakeClient(db),
        'n1',
        'b1',
        input({ actionItemsRaw: mixed, participants: participantOnly }),
      );
      expect(bell.calls).toHaveLength(2);
      expect(bell.calls.map((c) => c.createdBy)).toEqual([SYSTEM, SYSTEM]);
    });

    it('when the system account cannot be read: no bell, the follow-ups are still written and stamped', async () => {
      const db = baseDb();
      const outcome = await applyNoteToBooking(
        fakeClient(db, ['profiles.is_super_admin']),
        'n1',
        'b1',
        input({ actionItemsRaw: mixed, participants: participantOnly }),
      );
      expect(bell.calls).toHaveLength(0);
      expect(db.meeting_action_items).toHaveLength(4);
      // the owners were still resolved (the other profiles reads did not fail)
      expect(db.meeting_action_items.map((i) => i.owner_profile_id)).toEqual([ATTENDEE, ATTENDEE, OTHER, HOST]);
      expect(outcome).toBe('applied');
      expect(db.meeting_notes[0].action_items_applied_at).not.toBeNull();
    });

    it('when there is no system account at all: no bell, never the host or the recipient instead', async () => {
      const db = baseDb();
      db.profiles = db.profiles.filter((p) => p.id !== SYSTEM);
      const outcome = await applyNoteToBooking(
        fakeClient(db),
        'n1',
        'b1',
        input({ actionItemsRaw: mixed, participants: participantOnly }),
      );
      expect(bell.calls).toHaveLength(0);
      expect(db.meeting_action_items).toHaveLength(4);
      expect(outcome).toBe('applied');
    });

    it('when the system account IS this meeting’s host: no bell, so created_by never names the host', async () => {
      const db = baseDb();
      db.profiles = db.profiles.map((p) =>
        p.id === HOST ? { ...p, is_super_admin: true, created_at: '2023-01-01T00:00:00Z' } : p,
      );
      const outcome = await applyNoteToBooking(
        fakeClient(db),
        'n1',
        'b1',
        input({ actionItemsRaw: mixed, participants: participantOnly }),
      );
      expect(bell.calls).toHaveLength(0);
      expect(db.meeting_action_items).toHaveLength(4);
      expect(outcome).toBe('applied');
    });
  });

  it('rings the bell through the shared notifier, not the meeting trigger service', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'lib/services/meetings/meeting-note-followups.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"]@\/lib\/services\/meetings\/meeting-trigger-service['"]/);
    expect(src).toMatch(/from ['"]@\/lib\/services\/_shared\/notifications\/notify['"]/);
  });
});

// ── 4b. one set of follow-ups per meeting: the AI drafter (#4053) ───────────
//
// The drafter writes follow-ups with source 'ai_draft' when Fireflies has no
// summary yet. If the booking already holds any, the Fireflies set is not
// added on top. The drafter does the same the other way round
// (meeting-note-draft.ts: it adds nothing to a booking with ANY follow-ups).

function aiDraftItem(bookingId = 'b1'): Row {
  return {
    id: `ai-${bookingId}`,
    booking_id: bookingId,
    host_profile_id: HOST,
    action_text: 'AI draft: Send the draft',
    owner_label: null,
    owner_profile_id: ATTENDEE,
    status: 'open',
    source: 'ai_draft',
  };
}

describe('applyNoteToBooking — the AI drafter got there first', () => {
  const twoOwners = '**Selvi**\nSend the draft by 30 Sep\n**Bharathi**\nSend the report';
  const withParticipant = {
    actionItemsRaw: twoOwners,
    participants: [{ email: 'other@example.test', displayName: 'Bharathi N' }],
  };

  it('adds no Fireflies follow-ups and rings no bell, and stamps the note so it is not retried', async () => {
    const db = baseDb({ meeting_action_items: [aiDraftItem()] });
    const outcome = await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input(withParticipant));

    expect(outcome).toBe('skipped_ai_draft_exists');
    expect(db.meeting_action_items).toEqual([aiDraftItem()]);
    expect(bell.calls).toHaveLength(0);
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('stamps the skip even when Fireflies has no overview yet', async () => {
    const db = baseDb({ meeting_action_items: [aiDraftItem()] });
    const outcome = await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input({ ...withParticipant, summary: null }));

    expect(outcome).toBe('skipped_ai_draft_exists');
    expect(db.meeting_action_items).toHaveLength(1);
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('only AI-drafted rows stop it: a booking with other follow-ups still gets the Fireflies set', async () => {
    const hostWritten = { ...aiDraftItem(), id: 'by-host', action_text: 'Book the hall', source: null };
    const db = baseDb({ meeting_action_items: [hostWritten] });
    const outcome = await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input(withParticipant));

    expect(outcome).toBe('applied');
    expect(db.meeting_action_items).toHaveLength(3);
    expect(db.meeting_action_items.slice(1).map((i) => i.source)).toEqual(['fireflies', 'fireflies']);
  });

  it('an AI draft on a DIFFERENT booking does not stop it', async () => {
    const db = baseDb({ meeting_action_items: [aiDraftItem('b2')] });
    const outcome = await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input(withParticipant));

    expect(outcome).toBe('applied');
    expect(db.meeting_action_items.filter((i) => i.booking_id === 'b1')).toHaveLength(2);
  });

  it('with no follow-ups on the booking: today’s behaviour, every row marked fireflies, owners belled', async () => {
    const db = baseDb();
    const outcome = await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input(withParticipant));

    expect(outcome).toBe('applied');
    expect(db.meeting_action_items.map((i) => [i.owner_profile_id, i.due_date, i.source])).toEqual([
      [ATTENDEE, '2026-09-30', 'fireflies'],
      [OTHER, null, 'fireflies'],
    ]);
    expect(bell.calls.map((c) => (c.userIds as string[])[0]).sort()).toEqual([ATTENDEE, OTHER].sort());
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('when the check cannot be read: nothing is added, nobody is belled, the note is NOT stamped', async () => {
    const db = baseDb({ meeting_action_items: [] });
    const outcome = await applyNoteToBooking(
      fakeClient(db, ['meeting_action_items']),
      'n1',
      'b1',
      input(withParticipant),
    );

    expect(outcome).toBe('ai_draft_check_failed');
    expect(db.meeting_action_items).toHaveLength(0);
    expect(bell.calls).toHaveLength(0);
    expect(db.meeting_notes[0].action_items_applied_at).toBeNull();

    // the next run, with the read working, does the work
    expect(await applyNoteToBooking(fakeClient(db), 'n1', 'b1', input(withParticipant))).toBe('applied');
    expect(db.meeting_action_items).toHaveLength(2);
  });

  it('a note with no follow-ups does not even ask (and is stamped as before)', async () => {
    const db = baseDb({ meeting_action_items: [aiDraftItem()] });
    const outcome = await applyNoteToBooking(fakeClient(db, ['meeting_action_items']), 'n1', 'b1', input());

    expect(outcome).toBe('applied');
    expect(db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });
});

// ── 5. the hand-link door ────────────────────────────────────────────────────

const link = vi.hoisted(() => ({ db: null as unknown as Record<string, Array<Record<string, unknown>>> }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', async () => {
  return {
    createServiceRoleClient: () => fakeClientForMock(link.db),
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'linker' } }, error: null }) },
      rpc: async (_fn: string, args: { p_note_id: string; p_booking_id: string }) => {
        const note = link.db.meeting_notes.find((n) => n.id === args.p_note_id)!;
        if (note.booking_id) return { error: { message: 'this note is already linked to a meeting — unlink it first' } };
        note.booking_id = args.p_booking_id;
        return { data: args.p_note_id, error: null };
      },
    }),
  };
});

// vi.mock factories are hoisted above the module body, so they reach the fake
// through this late-bound indirection rather than the const above.
function fakeClientForMock(db: Db) {
  return fakeClient(db);
}

describe('linkMeetingNote — a hand-linked note becomes follow-ups, once', () => {
  it('applies the stored action items on link, and a relink does not duplicate them', async () => {
    const { linkMeetingNote } = await import('@/app/(routes)/meetings/notes/actions');

    link.db = baseDb({
      meeting_notes: [
        {
          id: 'n9',
          booking_id: null,
          action_items_applied_at: null,
          title: 'Visit planning',
          summary: 'We planned the visit.',
          occurred_at: '2026-09-20T05:00:00.000Z',
          duration_minutes: 20,
          raw: {
            summary: { action_items: '**Selvi**\nSend the visit plan by 25 Sep' },
            meeting_attendees: [{ email: 'Visitor@Example.test', displayName: 'Selvi R' }],
          },
        },
      ],
      hr_recruitment_interviews: [blankInterview('b1')],
    });

    expect(await linkMeetingNote({ noteId: 'n9', bookingId: 'b1' })).toEqual({ success: true });
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(link.db.meeting_action_items[0]).toMatchObject({
      booking_id: 'b1',
      owner_profile_id: ATTENDEE,
      due_date: '2026-09-25',
    });
    expect(bell.calls).toHaveLength(1);
    // The stored meeting_notes.title never reaches the owner's bell.
    expect(JSON.stringify(bell.calls[0])).not.toContain('Visit planning');

    // A hand-link never writes the candidate's interview record.
    expect(link.db.hr_recruitment_interviews[0]).toMatchObject({
      outcome_summary: null,
      duration_minutes: null,
    });

    // unlink (fn_unlink_meeting_note), then link again
    link.db.meeting_notes[0].booking_id = null;
    expect(await linkMeetingNote({ noteId: 'n9', bookingId: 'b1' })).toEqual({ success: true });
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(bell.calls).toHaveLength(1);
  });

  it('a hand-link onto a booking the AI drafter already filled adds nothing and rings no bell', async () => {
    const { linkMeetingNote } = await import('@/app/(routes)/meetings/notes/actions');

    link.db = baseDb({
      meeting_notes: [
        {
          id: 'n9',
          booking_id: null,
          action_items_applied_at: null,
          title: 'Visit planning',
          summary: 'We planned the visit.',
          occurred_at: '2026-09-20T05:00:00.000Z',
          duration_minutes: 20,
          raw: {
            summary: { action_items: '**Selvi**\nSend the visit plan by 25 Sep' },
            meeting_attendees: [{ email: 'visitor@example.test', displayName: 'Selvi R' }],
          },
        },
      ],
      meeting_action_items: [aiDraftItem()],
    });

    expect(await linkMeetingNote({ noteId: 'n9', bookingId: 'b1' })).toEqual({ success: true });
    expect(link.db.meeting_action_items).toEqual([aiDraftItem()]);
    expect(bell.calls).toHaveLength(0);
    expect(link.db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
  });

  it('reads the stored raw the same way the Fireflies client does', () => {
    const got = noteFollowupInputFromStored({
      title: 't',
      summary: null,
      occurred_at: null,
      duration_minutes: null,
      raw: {
        summary: { action_items: '   ' },
        meeting_attendees: [
          { email: ' A@Example.test ', displayName: '' },
          { email: 'a@example.test', displayName: 'dup' },
          { email: '', displayName: 'no address' },
          null,
        ],
      },
    });
    expect(got.actionItemsRaw).toBeNull();
    expect(got.participants).toEqual([{ email: 'a@example.test', displayName: null }]);
  });
});

// ── 6. the ingest door: which booking a stored note's follow-ups go onto ─────

describe('ingest — follow-ups follow the note’s STORED link, not the calendar', () => {
  const CRON = 'test-cron-secret';
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = CRON;
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
  });

  function transcript(over: Partial<FirefliesTranscript> = {}): FirefliesTranscript {
    return {
      id: 'ff-1',
      title: 'Weekly review',
      calendarId: 'cal-1',
      transcriptUrl: null,
      recordingUrl: null,
      summary: 'We reviewed the plan.',
      shortSummary: null,
      actionItemsRaw: '**Selvi**\nSend the draft by 30 Sep',
      occurredAt: '2026-09-20T05:00:00.000Z',
      durationMinutes: 30,
      participants: [],
      raw: {},
      ...over,
    };
  }

  async function tick(t: FirefliesTranscript) {
    fireflies.data = [t];
    const { GET } = await import('@/app/api/meetings/notes/ingest/route');
    const res = await GET(
      new NextRequest('https://example.test/api/meetings/notes/ingest', {
        headers: { authorization: `Bearer ${CRON}` },
      }),
    );
    expect(res.status).toBe(200);
    return res.json();
  }

  function ingestDb(over: Partial<Db> = {}): Db {
    return baseDb({
      meeting_notes: [],
      meeting_bookings: [
        { id: 'b1', google_event_id: 'cal-1', host_profile_id: HOST, attendee_profile_id: ATTENDEE },
        { id: 'b2', google_event_id: null, host_profile_id: HOST, attendee_profile_id: ATTENDEE },
      ],
      ...over,
    });
  }

  it('a NEW note goes onto the calendar-matched booking, and fills its interview record', async () => {
    link.db = ingestDb({ hr_recruitment_interviews: [blankInterview('b1')] });
    await tick(transcript());

    expect(link.db.meeting_notes).toHaveLength(1);
    expect(link.db.meeting_notes[0].booking_id).toBe('b1');
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(link.db.meeting_action_items[0]).toMatchObject({ booking_id: 'b1', owner_profile_id: ATTENDEE });
    expect(link.db.hr_recruitment_interviews[0]).toMatchObject({
      outcome_summary: 'We reviewed the plan.',
      duration_minutes: 30,
    });
  });

  it('a note a human UNLINKED never gets follow-ups, though its calendar id still matches', async () => {
    link.db = ingestDb({
      // First seen unsummarised (so never stamped), then unlinked by a person.
      meeting_notes: [
        { id: 'n1', provider: 'fireflies', provider_ref: 'ff-1', booking_id: null, action_items_applied_at: null },
      ],
      hr_recruitment_interviews: [blankInterview('b1')],
    });

    await tick(transcript()); // the tick that brings the summary

    expect(link.db.meeting_notes[0].booking_id).toBeNull();
    expect(link.db.meeting_action_items).toHaveLength(0);
    expect(bell.calls).toHaveLength(0);
    expect(link.db.hr_recruitment_interviews[0].outcome_summary).toBeNull();
  });

  it('a note linked BY HAND before its summary gets its follow-ups when the summary arrives on a tick', async () => {
    link.db = ingestDb({
      meeting_notes: [
        { id: 'n1', provider: 'fireflies', provider_ref: 'ff-1', booking_id: 'b2', action_items_applied_at: null },
      ],
      hr_recruitment_interviews: [blankInterview('b1'), blankInterview('b2')],
    });

    // The calendar id points at b1; the person linked it to b2. b2 wins.
    await tick(transcript());

    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(link.db.meeting_action_items[0]).toMatchObject({ booking_id: 'b2', owner_profile_id: ATTENDEE });
    expect(bell.calls).toHaveLength(1);
    expect(JSON.stringify(bell.calls[0])).not.toContain('Weekly review');
    expect(link.db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));
    // Neither interview record is written: b2 is a hand-link, b1 is not the link.
    expect(link.db.hr_recruitment_interviews.map((i) => i.outcome_summary)).toEqual([null, null]);

    // And with no calendar id at all, the same stored link still decides.
    link.db.meeting_notes[0].action_items_applied_at = null;
    link.db.meeting_action_items.length = 0;
    await tick(transcript({ calendarId: null }));
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(link.db.meeting_action_items[0].booking_id).toBe('b2');
  });

  it('the tick that brings the summary adds nothing onto a booking the AI drafter already filled', async () => {
    link.db = ingestDb({
      meeting_notes: [
        { id: 'n1', provider: 'fireflies', provider_ref: 'ff-1', booking_id: 'b1', action_items_applied_at: null },
      ],
      meeting_action_items: [aiDraftItem('b1')],
    });

    await tick(transcript());
    expect(link.db.meeting_action_items).toEqual([aiDraftItem('b1')]);
    expect(bell.calls).toHaveLength(0);
    expect(link.db.meeting_notes[0].action_items_applied_at).toEqual(expect.any(String));

    // and the next tick leaves it alone
    await tick(transcript());
    expect(link.db.meeting_action_items).toHaveLength(1);
  });

  it('an auto-matched note first seen unsummarised is applied once, on the tick that brings the summary', async () => {
    link.db = ingestDb({ hr_recruitment_interviews: [blankInterview('b1')] });

    await tick(transcript({ summary: null, actionItemsRaw: null }));
    expect(link.db.meeting_notes[0].booking_id).toBe('b1');
    // (the fake has no column defaults: an inserted row simply lacks the stamp)
    expect(link.db.meeting_notes[0].action_items_applied_at ?? null).toBeNull();
    expect(link.db.meeting_action_items).toHaveLength(0);

    await tick(transcript());
    expect(link.db.meeting_action_items).toHaveLength(1);
    // stored link == calendar match, so this IS the calendar door
    expect(link.db.hr_recruitment_interviews[0].outcome_summary).toBe('We reviewed the plan.');

    await tick(transcript());
    expect(link.db.meeting_action_items).toHaveLength(1);
  });
});
