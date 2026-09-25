// __tests__/meetings/meeting-note-followups.test.ts
//
// The shared follow-up path for meeting notes (lib/services/meetings/
// meeting-note-followups.ts): the parser moved out of the ingest route must
// behave exactly as before, a note Fireflies has not summarised is not stamped,
// the booking's host/attendee become owner candidates under the same
// exactly-one rule, due dates come only from explicit calendar dates, the
// hand-link applies once, and owners (never the host) get one bell each.
//
// All fixtures are invented; no real meeting content.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const bell = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  keys: new Set<string>(),
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: vi.fn(async (_db: unknown, opts: Record<string, unknown>) => {
    const key = opts.idempotencyKey as string | undefined;
    if (key && bell.keys.has(key)) return null; // the DB's unique index
    if (key) bell.keys.add(key);
    bell.calls.push(opts);
    return `notif-${bell.calls.length}`;
  }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), dev: vi.fn(), info: vi.fn() },
}));

import {
  applyNoteToBooking,
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

function fakeClient(db: Db) {
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    const rows = () => (db[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (mode === 'insert') {
        (db[table] ??= []).push(...inserted);
        return { data: inserted, error: null };
      }
      if (mode === 'update') {
        for (const r of rows()) Object.assign(r, patch);
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      limit: () => b,
      insert: (r: Row | Row[]) => ((mode = 'insert'), (inserted = Array.isArray(r) ? r : [r]), b),
      update: (p: Row) => ((mode = 'update'), (patch = p), b),
      upsert: () => b,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
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

function baseDb(overrides: Partial<Db> = {}): Db {
  return {
    meeting_notes: [{ id: 'n1', booking_id: 'b1', action_items_applied_at: null }],
    meeting_bookings: [{ id: 'b1', host_profile_id: HOST, attendee_profile_id: ATTENDEE }],
    profiles: [
      { id: HOST, email: 'host@example.test', full_name: 'Aravind Kumaran' },
      { id: ATTENDEE, email: 'visitor@example.test', full_name: 'Prof. Dr. Selvi Rajendran' },
      { id: OTHER, email: 'other@example.test', full_name: 'Bharathi Natarajan' },
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

beforeEach(() => {
  bell.calls.length = 0;
  bell.keys.clear();
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

// ── 3. due dates: explicit or nothing ────────────────────────────────────────

describe('parseExplicitDueDate', () => {
  const MEETING = '2026-09-20T05:00:00.000Z';

  it.each([
    ['Send the report by 30 Sep', '2026-09-30'],
    ['Send the report by 30th September', '2026-09-30'],
    ['Send the report by 30/09/2026', '2026-09-30'],
    ['Send the report by 30-09-2026', '2026-09-30'],
    ['Send the report by September 30', '2026-09-30'],
    ['Send the report by Sep 30th, 2027', '2027-09-30'],
    ['Send the report by 2026-10-02', '2026-10-02'],
    ['Book the hall for 5 Jan', '2027-01-05'], // year-less and before the meeting → next one
    ['Book the hall for May 4', '2027-05-04'],
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

  it('does not guess a year when the meeting date is unknown', () => {
    expect(parseExplicitDueDate('by 30 Sep', null)).toBeNull();
    expect(parseExplicitDueDate('by 30/09/2026', null)).toBe('2026-09-30');
  });

  it('resolves the meeting day in campus time, not UTC', () => {
    // 21 Sep 20:00 UTC is already 22 Sep in India; "21 Sep" has passed → next year.
    expect(parseExplicitDueDate('by 21 Sep', '2026-09-21T20:00:00.000Z')).toBe('2027-09-21');
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
      recipientIds: [ATTENDEE],
      createdBy: HOST,
      url: '/meetings/action-items',
      idempotencyKey: `meetings:note-followup-owner:n1:${ATTENDEE}`,
      metadata: { note_id: 'n1', booking_id: 'b1', item_count: 2 },
    });

    // A second pass that got past the stamp (e.g. a retried run) cannot bell twice.
    db.meeting_notes[0].action_items_applied_at = null;
    db.meeting_action_items.length = 0;
    await applyNoteToBooking(fakeClient(db), 'n1', 'b1', note);
    expect(bell.calls).toHaveLength(1);
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
    });

    expect(await linkMeetingNote({ noteId: 'n9', bookingId: 'b1' })).toEqual({ success: true });
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(link.db.meeting_action_items[0]).toMatchObject({
      booking_id: 'b1',
      owner_profile_id: ATTENDEE,
      due_date: '2026-09-25',
    });
    expect(bell.calls).toHaveLength(1);

    // unlink (fn_unlink_meeting_note), then link again
    link.db.meeting_notes[0].booking_id = null;
    expect(await linkMeetingNote({ noteId: 'n9', bookingId: 'b1' })).toEqual({ success: true });
    expect(link.db.meeting_action_items).toHaveLength(1);
    expect(bell.calls).toHaveLength(1);
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
