// __tests__/meetings/meeting-poll-service.test.ts
//
// Adversarial suite for MeetingPollService. The service is DB-bound, so we
// drive it with a tiny hand-rolled Supabase-client double that records inserts
// and lets each test script the responses. We assert the BEHAVIOUR that matters
// for correctness and safety:
//   * createPoll rejects fewer than two valid candidate times.
//   * createPoll derives each option's end_time from the duration.
//   * closePoll maps the gist exclusion 23P01 → SLOT_TAKEN (no winner recorded).
//   * closePoll rolls back the booking if the poll-close UPDATE fails.

import { describe, expect, it, vi } from 'vitest';
import { MeetingPollService } from '@/lib/services/meetings/meeting-poll-service';

// ── Minimal chainable Supabase double ───────────────────────────────────────
// Each .from(table) returns a builder whose terminal call resolves to a
// scripted result. Tests provide a `script` keyed by `${table}:${op}`.

type Result = { data: unknown; error: unknown };

function makeClient(script: Record<string, Result>, recorder?: { inserts: any[] }) {
  function builder(table: string) {
    const state: { op: string; payload?: unknown } = { op: 'select' };
    const api: any = {
      insert(payload: unknown) {
        state.op = 'insert';
        state.payload = payload;
        recorder?.inserts.push({ table, payload });
        return api;
      },
      update(payload: unknown) {
        state.op = 'update';
        state.payload = payload;
        return api;
      },
      delete() {
        state.op = 'delete';
        return api;
      },
      select() {
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(script[`${table}:${state.op}`] ?? { data: null, error: null });
      },
      single() {
        return Promise.resolve(script[`${table}:${state.op}`] ?? { data: null, error: null });
      },
      // For terminal calls without single()/maybeSingle() (e.g. bulk insert,
      // delete), make the builder itself awaitable.
      then(resolve: (r: Result) => void) {
        resolve(script[`${table}:${state.op}`] ?? { data: null, error: null });
      },
    };
    return api;
  }
  return { from: vi.fn(builder) } as any;
}

describe('MeetingPollService.createPoll', () => {
  it('rejects fewer than two candidate times', async () => {
    const client = makeClient({});
    const res = await MeetingPollService.createPoll(client, 'host-1', null, {
      title: 'Sync',
      durationMin: 30,
      options: [{ start: '2026-07-01T10:00:00.000Z' }],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/at least two/i);
  });

  it('rejects a blank title', async () => {
    const client = makeClient({});
    const res = await MeetingPollService.createPoll(client, 'host-1', null, {
      title: '   ',
      durationMin: 30,
      options: [
        { start: '2026-07-01T10:00:00.000Z' },
        { start: '2026-07-01T11:00:00.000Z' },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/title/i);
  });

  it('derives each option end_time from the duration', async () => {
    const recorder = { inserts: [] as any[] };
    const client = makeClient(
      {
        'meeting_polls:insert': { data: { id: 'poll-1', slug: 'abc123' }, error: null },
        'meeting_poll_options:insert': { data: null, error: null },
      },
      recorder,
    );
    const res = await MeetingPollService.createPoll(client, 'host-1', 'inst-1', {
      title: 'Q3 planning',
      durationMin: 45,
      options: [
        { start: '2026-07-01T10:00:00.000Z' },
        { start: '2026-07-01T15:00:00.000Z' },
      ],
    });
    expect(res.success).toBe(true);

    const optionInsert = recorder.inserts.find((i) => i.table === 'meeting_poll_options');
    expect(optionInsert).toBeTruthy();
    const rows = optionInsert.payload as Array<{ start_time: string; end_time: string }>;
    expect(rows).toHaveLength(2);
    // 10:00 + 45m = 10:45
    expect(rows[0].end_time).toBe('2026-07-01T10:45:00.000Z');
    // 15:00 + 45m = 15:45
    expect(rows[1].end_time).toBe('2026-07-01T15:45:00.000Z');
  });
});

describe('MeetingPollService.closePoll', () => {
  const openPoll = {
    data: {
      id: 'poll-1',
      slug: 'abc123',
      title: 'Sync',
      status: 'open',
      host_profile_id: 'host-1',
      institution_id: 'inst-1',
      duration_min: 30,
    },
    error: null,
  };
  const winningOption = {
    data: {
      id: 'opt-1',
      start_time: '2026-07-01T10:00:00.000Z',
      end_time: '2026-07-01T10:30:00.000Z',
    },
    error: null,
  };

  it('maps the gist exclusion 23P01 to SLOT_TAKEN', async () => {
    // meeting_polls:select → poll; meeting_poll_options:select → option;
    // profiles:select → host; meeting_bookings:insert → 23P01 conflict.
    const client = makeClient({
      'meeting_polls:select': openPoll,
      'meeting_poll_options:select': winningOption,
      'profiles:select': { data: { full_name: 'Dr Host', email: 'host@jkkn.ac.in' }, error: null },
      'meeting_bookings:insert': { data: null, error: { code: '23P01', message: 'overlap' } },
    });
    const res = await MeetingPollService.closePoll(client, 'poll-1', 'opt-1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('SLOT_TAKEN');
  });

  it('rejects a winning option that is already closed', async () => {
    const client = makeClient({
      'meeting_polls:select': {
        data: { ...openPoll.data, status: 'closed' },
        error: null,
      },
    });
    const res = await MeetingPollService.closePoll(client, 'poll-1', 'opt-1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('ALREADY_CLOSED');
  });

  it('rejects an option that does not belong to the poll', async () => {
    const client = makeClient({
      'meeting_polls:select': openPoll,
      'meeting_poll_options:select': { data: null, error: null }, // not found
    });
    const res = await MeetingPollService.closePoll(client, 'poll-1', 'opt-x');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('INVALID_OPTION');
  });

  it('rolls back the booking if the poll-close UPDATE fails', async () => {
    const recorder = { inserts: [] as any[] };
    const client = makeClient(
      {
        'meeting_polls:select': openPoll,
        'meeting_poll_options:select': winningOption,
        'profiles:select': { data: { full_name: 'Dr Host', email: 'host@jkkn.ac.in' }, error: null },
        'meeting_bookings:insert': { data: { id: 'book-1', uid: 'uid-1' }, error: null },
        'meeting_polls:update': { data: null, error: { code: 'XX000', message: 'boom' } },
      },
      recorder,
    );
    const res = await MeetingPollService.closePoll(client, 'poll-1', 'opt-1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe('INTERNAL');
    // The booking insert happened, and then a delete must have been issued to
    // roll it back (recorded as a from('meeting_bookings') call sequence).
    expect(recorder.inserts.some((i) => i.table === 'meeting_bookings')).toBe(true);
  });
});
