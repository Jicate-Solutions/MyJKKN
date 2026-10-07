// __tests__/meetings/meeting-record-route.test.ts
//
// The read half of the meeting-record PDF and the route in front of it.
//
//   • participants come from meeting_note_participants — never from
//     meeting_notes.raw, which the schema marks "not rendered to users";
//   • a failed read is an ERROR (500), never a PDF that says "No summary was
//     recorded" for a meeting that has one;
//   • the route repeats the button's rule: a meeting that is not over, or has
//     nothing recorded, answers 404 and Chromium is never started.
//
// Supabase and the renderer are faked; the HTML builder runs for real (with
// the font CSS stubbed) so the route test can check what would be printed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/utils/bos/pdf-fonts', () => ({
  pdfFontFaceCss: () => '/* fonts */',
  PDF_FONT_STACK: `'Tinos', 'Noto Sans Tamil', serif`,
}));

const render = vi.hoisted(() => vi.fn(async (_html: string, _opts?: unknown) => Buffer.from('%PDF-1.4 fake')));
vi.mock('@/lib/pdf/syllabus-pdf', () => ({ renderSyllabusPdf: render }));

const server = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server.client }));

import { GET } from '@/app/api/meetings/record/[uid]/route';
import { isMeetingRecordReady, loadMeetingRecord } from '@/lib/services/meetings/meeting-record';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// A tiny chainable fake: one canned result per table, every select recorded.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: { message: string } | null };

const PAST_START = '2026-09-01T05:30:00Z';
const PAST_END = '2026-09-01T06:00:00Z';
const FUTURE_START = '2099-01-01T05:30:00Z';
const FUTURE_END = '2099-01-01T06:00:00Z';

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    uid: 'uid1',
    status: 'completed',
    outcome_marked_by: 'host',
    start_time: PAST_START,
    end_time: PAST_END,
    attendee_name: 'Kavya R',
    attendee_email: 'kavya@jkkn.ac.in',
    host_profile_id: 'host1',
    meeting_type_id: 't1',
    ...over,
  };
}

function tables(over: Partial<Record<string, Result>> = {}): Record<string, Result> {
  return {
    meeting_bookings: { data: booking(), error: null },
    meeting_types: { data: { title: 'Weekly review' }, error: null },
    meeting_notes: {
      data: { id: 'n1', title: 'Weekly review', summary: '- Ship it', duration_minutes: 28, occurred_at: PAST_START },
      error: null,
    },
    meeting_note_participants: {
      data: [
        { display_name: 'Third Person', email: 'third@jkkn.ac.in' },
        { display_name: null, email: 'fourth@jkkn.ac.in' },
      ],
      error: null,
    },
    profiles: { data: { full_name: 'Host Person', email: 'host@jkkn.ac.in' }, error: null },
    meeting_action_items: { data: [], error: null },
    ...over,
  } as Record<string, Result>;
}

function fakeClient(canned: Record<string, Result>, user: { id: string } | null = { id: 'viewer1' }) {
  const calls: Array<{ table: string; select: string; eq: Array<[string, unknown]> }> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      const call = { table, select: '', eq: [] as Array<[string, unknown]> };
      calls.push(call);
      const res = canned[table] ?? { data: null, error: null };
      const b: Record<string, unknown> = {
        select(cols: string) {
          call.select = cols;
          return b;
        },
        eq(col: string, val: unknown) {
          call.eq.push([col, val]);
          return b;
        },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => res,
        then(resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) {
          return Promise.resolve(res).then(resolve, reject);
        },
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

async function get(uid = 'uid1') {
  return GET(new Request(`http://localhost/api/meetings/record/${uid}`), { params: Promise.resolve({ uid }) });
}

beforeEach(() => {
  render.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// loadMeetingRecord
// ---------------------------------------------------------------------------

describe('loadMeetingRecord — where the people come from', () => {
  it('reads participants from meeting_note_participants for the note, never meeting_notes.raw', async () => {
    const { client, calls } = fakeClient(tables());
    const record = await loadMeetingRecord(client, 'uid1');

    expect(record?.note?.participants).toEqual([
      { name: 'Third Person', email: 'third@jkkn.ac.in' },
      { name: null, email: 'fourth@jkkn.ac.in' },
    ]);
    const participantsRead = calls.find((c) => c.table === 'meeting_note_participants');
    expect(participantsRead?.select).toBe('display_name, email');
    expect(participantsRead?.eq).toEqual([['note_id', 'n1']]);

    const noteRead = calls.find((c) => c.table === 'meeting_notes');
    expect(noteRead?.select).not.toMatch(/raw|transcript_url|recording_url|audio_url|video_url/);
  });

  it('reads who closed the meeting, so the PDF can tell a notes-closed meeting from a held one', async () => {
    const { client, calls } = fakeClient(tables({ meeting_bookings: { data: booking({ outcome_marked_by: 'notes' }), error: null } }));
    const record = await loadMeetingRecord(client, 'uid1');
    expect(record?.outcomeMarkedBy).toBe('notes');
    const bookingRead = calls.find((c) => c.table === 'meeting_bookings');
    expect(bookingRead?.select.split(',').map((c) => c.trim())).toContain('outcome_marked_by');
  });

  it('does not read participants when there is no note', async () => {
    const { client, calls } = fakeClient(tables({ meeting_notes: { data: null, error: null } }));
    const record = await loadMeetingRecord(client, 'uid1');
    expect(record?.note).toBeNull();
    expect(calls.some((c) => c.table === 'meeting_note_participants')).toBe(false);
  });

  it('returns null when the booking is hidden or does not exist', async () => {
    const { client } = fakeClient(tables({ meeting_bookings: { data: null, error: null } }));
    expect(await loadMeetingRecord(client, 'nope')).toBeNull();
  });

  it.each(['meeting_bookings', 'meeting_notes', 'meeting_note_participants', 'meeting_action_items', 'profiles', 'meeting_types'])(
    'throws when the %s read fails — never an empty section',
    async (table) => {
      const canned = tables();
      canned[table] = { data: null, error: { message: 'boom' } };
      const { client } = fakeClient(canned);
      await expect(loadMeetingRecord(client, 'uid1')).rejects.toThrow(/Could not read/);
    },
  );
});

describe('isMeetingRecordReady — the button rule, repeated', () => {
  const base = {
    uid: 'u',
    outcomeMarkedBy: null,
    meetingTypeTitle: null,
    attendeeName: null,
    attendeeEmail: null,
    hostName: null,
    hostEmail: null,
  };
  const note = { title: null, summary: 'x', durationMinutes: null, occurredAt: null, participants: [] };
  const item = { actionText: 'a', decisionText: null, ownerLabel: null, dueDate: null, status: 'open' as const };
  const now = new Date('2026-09-28T00:00:00Z');

  it('refuses a meeting that is still ahead, even with a note', () => {
    expect(
      isMeetingRecordReady({ ...base, status: 'confirmed', startTime: FUTURE_START, endTime: FUTURE_END, note, followUps: [] }, now),
    ).toBe(false);
  });
  it('refuses a past meeting with nothing recorded', () => {
    expect(
      isMeetingRecordReady({ ...base, status: 'confirmed', startTime: PAST_START, endTime: PAST_END, note: null, followUps: [] }, now),
    ).toBe(false);
  });
  it('accepts a past meeting with a note, or with a follow-up', () => {
    expect(
      isMeetingRecordReady({ ...base, status: 'confirmed', startTime: PAST_START, endTime: PAST_END, note, followUps: [] }, now),
    ).toBe(true);
    expect(
      isMeetingRecordReady({ ...base, status: 'confirmed', startTime: PAST_START, endTime: PAST_END, note: null, followUps: [item] }, now),
    ).toBe(true);
  });
  it('counts a meeting marked held or no-show as over, as the page does', () => {
    expect(
      isMeetingRecordReady({ ...base, status: 'no_show', startTime: FUTURE_START, endTime: FUTURE_END, note: null, followUps: [item] }, now),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/meetings/record/{uid}
// ---------------------------------------------------------------------------

describe('GET /api/meetings/record/{uid}', () => {
  it('401 when signed out, and Chromium is never started', async () => {
    server.client = fakeClient(tables(), null).client;
    const res = await get();
    expect(res.status).toBe(401);
    expect(render).not.toHaveBeenCalled();
  });

  it('404 for a meeting that is still ahead — no record yet', async () => {
    server.client = fakeClient(
      tables({ meeting_bookings: { data: booking({ status: 'confirmed', start_time: FUTURE_START, end_time: FUTURE_END }), error: null } }),
    ).client;
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Nothing has been recorded for this meeting yet.');
    expect(render).not.toHaveBeenCalled();
  });

  it('404 for a past meeting with no note and no follow-ups', async () => {
    server.client = fakeClient(
      tables({
        meeting_bookings: { data: booking({ status: 'confirmed' }), error: null },
        meeting_notes: { data: null, error: null },
      }),
    ).client;
    const res = await get();
    expect(res.status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });

  it('404 when the booking is hidden from the viewer', async () => {
    server.client = fakeClient(tables({ meeting_bookings: { data: null, error: null } })).client;
    const res = await get();
    expect(res.status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });

  it('500 with a plain message when the note read fails — not an empty PDF', async () => {
    server.client = fakeClient(tables({ meeting_notes: { data: null, error: { message: 'bad select' } } })).client;
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toMatch(/json/);
    expect((await res.json()).error).toMatch(/Could not make the PDF/);
    expect(render).not.toHaveBeenCalled();
  });

  it('500 when the participants read fails', async () => {
    server.client = fakeClient(
      tables({ meeting_note_participants: { data: null, error: { message: 'denied' } } }),
    ).client;
    const res = await get();
    expect(res.status).toBe(500);
    expect(render).not.toHaveBeenCalled();
  });

  it('500 when the renderer fails', async () => {
    server.client = fakeClient(tables()).client;
    render.mockRejectedValueOnce(new Error('no chromium'));
    const res = await get();
    expect(res.status).toBe(500);
  });

  it('200 with the PDF for a finished meeting; names only, no addresses, no links', async () => {
    server.client = fakeClient(tables()).client;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="meeting-record-2026-09-01-kavya-r.pdf"');
    expect(render).toHaveBeenCalledTimes(1);

    const [html, opts] = render.mock.calls[0];
    const doc = html.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(doc).toContain('<td>Third Person</td>');
    expect(doc).toContain('<td>fourth</td>');
    expect(doc).toContain('<td>Host Person</td>');
    expect(doc).not.toContain('@');
    expect(doc).not.toContain('<a ');
    expect(opts).toEqual({ footerText: 'MyJKKN meeting record - booking uid1' });
  });

  it('200 for a notes-closed meeting says it closed automatically, never "Held"', async () => {
    server.client = fakeClient(
      tables({ meeting_bookings: { data: booking({ status: 'completed', outcome_marked_by: 'notes' }), error: null } }),
    ).client;
    const res = await get();
    expect(res.status).toBe(200);
    const doc = (render.mock.calls[0][0] as string).replace(/<style>[\s\S]*?<\/style>/, '');
    expect(doc).toContain('Closed automatically — notes linked');
    expect(doc).not.toMatch(/Held/);
  });

  it('200 for a meeting its host marked as happened still says "Held"', async () => {
    server.client = fakeClient(tables()).client;
    const res = await get();
    expect(res.status).toBe(200);
    const doc = (render.mock.calls[0][0] as string).replace(/<style>[\s\S]*?<\/style>/, '');
    expect(doc).toContain('· Held</p>');
  });
});
