/**
 * My Follow-ups (/meetings/action-items).
 *
 * The page reads meeting_action_items through the SERVICE ROLE, which sees
 * every row. The explicit host-or-owner filter is therefore the whole access
 * control — these tests pin that a super admin (whom RLS would let see every
 * host's items) still gets only their own, that host and owner may each close
 * an item, that anyone else is refused, that only `status` is ever written,
 * and that a cancelled booking's items are still listed.
 *
 * Supabase is faked with a tiny in-memory table store that actually applies
 * the filters the service asks for — a filter the service forgets to send is
 * a row that leaks into the result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const HOST = '11111111-1111-4111-8111-111111111111';
const NAMED_OWNER = '22222222-2222-4222-8222-222222222222';
const SUPER_ADMIN = '33333333-3333-4333-8333-333333333333';
const OTHER_HOST = '44444444-4444-4444-8444-444444444444';

let tables: Record<string, Row[]>;
let updates: Array<{ table: string; payload: Row; filters: Array<[string, unknown]> }>;
let sessionUserId: string | null;
let reads: Array<{ table: string; filters: Array<[string, unknown]> }>;

function applyOr(rows: Row[], expr: string): Row[] {
  const clauses = expr.split(',').map((c) => {
    const [col, op, ...rest] = c.split('.');
    if (op !== 'eq') throw new Error(`fake only supports eq in or(): ${c}`);
    return [col, rest.join('.')] as const;
  });
  return rows.filter((r) => clauses.some(([col, val]) => String(r[col]) === val));
}

function fakeClient() {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let updatePayload: Row | null = null;
      const filters: Array<[string, unknown]> = [];
      const run = () => {
        if (updatePayload) {
          updates.push({ table, payload: updatePayload, filters: [...filters] });
          for (const r of rows) Object.assign(r, updatePayload);
          return { data: null, error: null };
        }
        reads.push({ table, filters: [...filters] });
        return { data: rows, error: null };
      };
      const chain = {
        select: () => chain,
        update(payload: Row) {
          updatePayload = payload;
          return chain;
        },
        or(expr: string) {
          filters.push(['or', expr]);
          rows = applyOr(rows, expr);
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          rows = rows.filter((r) => r[col] === val);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          filters.push([col, vals]);
          rows = rows.filter((r) => vals.includes(r[col]));
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        sessionUserId
          ? { data: { user: { id: sessionUserId } }, error: null }
          : { data: { user: null }, error: null },
    },
  }),
  createServiceRoleClient: () => fakeClient(),
}));

import { MeetingActionItemService } from '@/lib/services/meetings/meeting-action-item-service';
import {
  markMeetingFollowUpsDoneAction,
  setFollowUpStatusAction,
} from '@/app/(routes)/meetings/action-items/actions';

function item(id: string, over: Row): Row {
  return {
    id,
    booking_id: 'b-1',
    host_profile_id: HOST,
    action_text: `do ${id}`,
    decision_text: null,
    owner_label: null,
    owner_profile_id: null,
    due_date: null,
    status: 'open',
    created_at: '2026-09-20T05:00:00Z',
    updated_at: '2026-09-20T05:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  updates = [];
  reads = [];
  sessionUserId = HOST;
  tables = {
    meeting_action_items: [
      item('i-host-own', { owner_profile_id: HOST }),
      item('i-named-owner', { owner_profile_id: NAMED_OWNER, owner_label: 'Dr. K' }),
      item('i-unassigned', { owner_label: 'Ravi' }),
      item('i-cancelled', { booking_id: 'b-cancelled', owner_label: 'Mani' }),
      item('i-other-host', { booking_id: 'b-other', host_profile_id: OTHER_HOST }),
      item('i-done', { status: 'done' }),
    ],
    meeting_bookings: [
      { id: 'b-1', uid: 'uid-1', attendee_name: 'Asha', start_time: '2026-09-20T05:00:00Z', status: 'completed', host_profile_id: HOST, meeting_type_id: 't-1' },
      { id: 'b-cancelled', uid: 'uid-c', attendee_name: 'Bala', start_time: '2026-09-22T05:00:00Z', status: 'cancelled', host_profile_id: HOST, meeting_type_id: null },
      { id: 'b-other', uid: 'uid-o', attendee_name: 'Chitra', start_time: '2026-09-21T05:00:00Z', status: 'completed', host_profile_id: OTHER_HOST, meeting_type_id: 't-1' },
    ],
    meeting_types: [{ id: 't-1', title: 'Review' }],
    profiles: [
      { id: HOST, full_name: 'Host Person' },
      { id: NAMED_OWNER, full_name: 'Owner Person' },
    ],
  };
});

describe('listForProfile — the explicit host-or-owner filter', () => {
  it('a super admin sees only their own rows, never every host’s', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, SUPER_ADMIN);
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    // The filter is sent to the database, not merely applied afterwards.
    const itemRead = reads.find((r) => r.table === 'meeting_action_items')!;
    expect(itemRead.filters).toContainEqual([
      'or',
      `host_profile_id.eq.${SUPER_ADMIN},owner_profile_id.eq.${SUPER_ADMIN}`,
    ]);
  });

  it('the host sees their meetings’ open items in three bands, newest meeting first', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    const groups = res.data!;
    expect(groups.map((g) => g.booking_id)).toEqual(['b-cancelled', 'b-1']);
    const b1 = groups[1];
    expect(b1.viewer_is_host).toBe(true);
    expect(b1.meeting_title).toBe('Review');
    const bands = Object.fromEntries(b1.items.map((i) => [i.id, i.band]));
    expect(bands).toEqual({ 'i-host-own': 'yours', 'i-named-owner': 'others', 'i-unassigned': 'unassigned' });
    expect(b1.items.find((i) => i.id === 'i-named-owner')!.owner_name).toBe('Owner Person');
    // another host's item never appears; done is hidden by default
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain('i-other-host');
    expect(ids).not.toContain('i-done');
  });

  it('includeDone brings done items back', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST, {
      includeDone: true,
    });
    expect(res.data!.flatMap((g) => g.items.map((i) => i.id))).toContain('i-done');
  });

  it('an owner who is not the host sees only the item resolved to them, with no link rights', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, NAMED_OWNER);
    expect(res.data).toHaveLength(1);
    expect(res.data![0].viewer_is_host).toBe(false);
    expect(res.data![0].items.map((i) => [i.id, i.band])).toEqual([['i-named-owner', 'yours']]);
  });

  it('cancelled bookings are still listed', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    const cancelled = res.data!.find((g) => g.booking_id === 'b-cancelled')!;
    expect(cancelled.booking_status).toBe('cancelled');
    expect(cancelled.items.map((i) => i.id)).toEqual(['i-cancelled']);
  });

  it('refuses a non-uuid profile id instead of interpolating it into the filter', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, 'x,status.eq.open');
    expect(res).toEqual({ success: false, error: 'INVALID' });
  });
});

describe('setStatusAsHostOrOwner', () => {
  it('the owner may close their item', async () => {
    const res = await MeetingActionItemService.setStatusAsHostOrOwner(fakeClient() as never, 'i-named-owner', NAMED_OWNER, 'done');
    expect(res).toEqual({ success: true });
    expect(tables.meeting_action_items.find((r) => r.id === 'i-named-owner')!.status).toBe('done');
  });

  it('the host may close an item owned by someone else', async () => {
    const res = await MeetingActionItemService.setStatusAsHostOrOwner(fakeClient() as never, 'i-named-owner', HOST, 'done');
    expect(res).toEqual({ success: true });
  });

  it('a third person — even a super admin — gets FORBIDDEN and nothing is written', async () => {
    const res = await MeetingActionItemService.setStatusAsHostOrOwner(fakeClient() as never, 'i-named-owner', SUPER_ADMIN, 'done');
    expect(res).toEqual({ success: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
  });

  it('writes status and nothing else', async () => {
    await MeetingActionItemService.setStatusAsHostOrOwner(fakeClient() as never, 'i-unassigned', HOST, 'done');
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].payload)).toEqual(['status']);
    expect(updates[0].filters).toEqual([['id', 'i-unassigned']]);
  });

  it('rejects a status outside open/done', async () => {
    const res = await MeetingActionItemService.setStatusAsHostOrOwner(
      fakeClient() as never, 'i-named-owner', HOST, 'archived' as never,
    );
    expect(res).toEqual({ success: false, error: 'INVALID' });
  });
});

describe('server actions', () => {
  it('setFollowUpStatusAction gives a third person a plain message', async () => {
    sessionUserId = SUPER_ADMIN;
    const res = await setFollowUpStatusAction('i-named-owner', 'done');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Only the meeting host or the person this follow-up belongs to/);
  });

  it('setFollowUpStatusAction refuses a signed-out caller', async () => {
    sessionUserId = null;
    const res = await setFollowUpStatusAction('i-named-owner', 'done');
    expect(res).toEqual({ success: false, error: expect.stringMatching(/signed out/) });
  });

  it('Mark all done closes every open item for the host', async () => {
    const res = await markMeetingFollowUpsDoneAction('b-1');
    expect(res).toEqual({ success: true, updated: 3 });
    for (const u of updates) expect(Object.keys(u.payload)).toEqual(['status']);
  });

  it('Mark all done closes only the owner’s own items when the owner is not the host', async () => {
    sessionUserId = NAMED_OWNER;
    const res = await markMeetingFollowUpsDoneAction('b-1');
    expect(res).toEqual({ success: true, updated: 1 });
    const statuses = Object.fromEntries(tables.meeting_action_items.map((r) => [r.id, r.status]));
    expect(statuses['i-named-owner']).toBe('done');
    expect(statuses['i-host-own']).toBe('open');
    expect(statuses['i-unassigned']).toBe('open');
  });
});
