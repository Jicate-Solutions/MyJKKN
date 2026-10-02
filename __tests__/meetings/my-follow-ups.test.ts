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
 *
 * Round 2 (29 Sep): the meeting HEADER (title, who with, date, status, uid)
 * is attached only when the viewer is in the booking's invited set — a code
 * copy of the live fn_can_view_meeting_note booking rules (host, attendee by
 * profile id, attendee by email, co-host). An owner outside that set gets all
 * five fields as null. The host id and decision text never cross at all.
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
        order(col: string, opts?: { ascending?: boolean }) {
          const asc = opts?.ascending !== false;
          filters.push(['order', `${col}.${asc ? 'asc' : 'desc'}`]);
          rows = [...rows].sort((a, b) => {
            const x = String(a[col]);
            const y = String(b[col]);
            return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
          });
          return chain;
        },
        limit(n: number) {
          filters.push(['limit', n]);
          rows = rows.slice(0, n);
          return chain;
        },
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

import {
  FOLLOW_UP_LIMIT,
  MeetingActionItemService,
  followUpLimitNote,
  isInInvitedSet,
} from '@/lib/services/meetings/meeting-action-item-service';
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
    created_at: '2026-09-20T09:30:00Z',
    updated_at: '2026-09-20T09:30:00Z',
    ...over,
  };
}

const HEADER_FIELDS = [
  'booking_uid',
  'attendee_name',
  'start_time',
  'booking_status',
  'meeting_title',
] as const;

beforeEach(() => {
  updates = [];
  reads = [];
  sessionUserId = HOST;
  tables = {
    meeting_action_items: [
      item('i-host-own', { owner_profile_id: HOST }),
      item('i-named-owner', {
        owner_profile_id: NAMED_OWNER,
        owner_label: 'Dr. K',
        decision_text: 'Candidate not selected',
        due_date: '2026-10-01',
      }),
      item('i-unassigned', { owner_label: 'Ravi' }),
      item('i-cancelled', { booking_id: 'b-cancelled', owner_label: 'Mani' }),
      item('i-other-host', { booking_id: 'b-other', host_profile_id: OTHER_HOST }),
      item('i-done', { status: 'done' }),
    ],
    meeting_bookings: [
      { id: 'b-1', uid: 'uid-1', attendee_name: 'Asha', attendee_email: 'asha@example.com', attendee_profile_id: null, start_time: '2026-09-20T05:00:00Z', status: 'completed', host_profile_id: HOST, meeting_type_id: 't-1' },
      { id: 'b-cancelled', uid: 'uid-c', attendee_name: 'Bala', attendee_email: 'bala@example.com', attendee_profile_id: null, start_time: '2026-09-22T05:00:00Z', status: 'cancelled', host_profile_id: HOST, meeting_type_id: null },
      { id: 'b-other', uid: 'uid-o', attendee_name: 'Chitra', attendee_email: 'chitra@example.com', attendee_profile_id: null, start_time: '2026-09-21T05:00:00Z', status: 'completed', host_profile_id: OTHER_HOST, meeting_type_id: 't-1' },
    ],
    meeting_types: [{ id: 't-1', title: 'Review' }, { id: 't-2', title: 'Other type' }],
    meeting_type_cohosts: [],
    profiles: [
      { id: HOST, full_name: 'Host Person', email: 'host@jkkn.ac.in' },
      { id: NAMED_OWNER, full_name: 'Owner Person', email: 'owner@jkkn.ac.in' },
      { id: SUPER_ADMIN, full_name: 'Super Admin', email: 'admin@jkkn.ac.in' },
    ],
  };
});

/** The one group NAMED_OWNER gets for b-1. */
async function ownerGroup() {
  const res = await MeetingActionItemService.listForProfile(fakeClient() as never, NAMED_OWNER);
  expect(res.success).toBe(true);
  expect(res.data).toHaveLength(1);
  return res.data![0];
}

function bookingB1(): Row {
  return tables.meeting_bookings.find((b) => b.id === 'b-1')!;
}

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
    const group = await ownerGroup();
    expect(group.viewer_is_host).toBe(false);
    expect(group.items.map((i) => [i.id, i.band])).toEqual([['i-named-owner', 'yours']]);
  });

  it('the host id and the decision text never cross to the client', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    for (const g of res.data!) {
      for (const it of g.items) {
        expect(it).not.toHaveProperty('host_profile_id');
        expect(it).not.toHaveProperty('decision_text');
      }
    }
    expect(JSON.stringify(res.data)).not.toContain('Candidate not selected');
  });

  it('cancelled bookings are still listed', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    const cancelled = res.data!.find((g) => g.booking_id === 'b-cancelled')!;
    expect(cancelled.booking_status).toBe('cancelled');
    expect(cancelled.items.map((i) => i.id)).toEqual(['i-cancelled']);
  });

  it('past the limit the NEWEST follow-ups are kept, the oldest left out, and the page is told', async () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    tables.meeting_action_items = Array.from({ length: FOLLOW_UP_LIMIT + 2 }, (_, n) =>
      item(`n-${n}`, { created_at: new Date(base + n * 60_000).toISOString() }),
    );
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    const ids = res.data!.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toHaveLength(FOLLOW_UP_LIMIT);
    expect(ids).toContain(`n-${FOLLOW_UP_LIMIT + 1}`); // the newest
    expect(ids).not.toContain('n-0'); // the two oldest are the ones cut
    expect(ids).not.toContain('n-1');
    // Newest-first is asked of the database BEFORE the cap.
    const itemRead = reads.find((r) => r.table === 'meeting_action_items')!;
    const orderAt = itemRead.filters.findIndex(([k]) => k === 'order');
    const limitAt = itemRead.filters.findIndex(([k]) => k === 'limit');
    expect(itemRead.filters[orderAt]).toEqual(['order', 'created_at.desc']);
    expect(itemRead.filters[limitAt]).toEqual(['limit', FOLLOW_UP_LIMIT]);
    expect(orderAt).toBeLessThan(limitAt);
    // Inside one meeting the items still read oldest-kept → newest.
    expect(ids[0]).toBe('n-2');
    expect(ids[ids.length - 1]).toBe(`n-${FOLLOW_UP_LIMIT + 1}`);
    expect(followUpLimitNote(res.data!)).toBe('Showing the latest 500 follow-ups');
  });

  it('no limit note when every follow-up fits', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    expect(followUpLimitNote(res.data!)).toBeNull();
  });

  it('refuses a non-uuid profile id instead of interpolating it into the filter', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, 'x,status.eq.open');
    expect(res).toEqual({ success: false, error: 'INVALID' });
  });
});

describe('listForProfile — the meeting header only for the booking’s invited set', () => {
  it('an owner OUTSIDE the invited set gets none of the five header fields, on the server', async () => {
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(false);
    for (const f of HEADER_FIELDS) expect(group[f]).toBeNull();
    // Nothing about the booking is anywhere in what crosses to the client —
    // not even the item's created_at ('2026-09-20T09:30:00Z'), which would
    // hint at when the meeting took place (round 3).
    const wire = JSON.stringify(group);
    for (const leak of ['uid-1', 'Asha', 'asha@example.com', 'Review', 'completed', '2026-09-20T05:00:00Z', '2026-09-20T09:30:00Z', HOST, 'Candidate not selected']) {
      expect(wire).not.toContain(leak);
    }
    // Their own follow-up still shows: ids, text, owner fields, due date, status.
    expect(group.items).toHaveLength(1);
    expect(group.items[0]).not.toHaveProperty('created_at');
    expect(group.items[0]).toEqual({
      id: 'i-named-owner',
      booking_id: 'b-1',
      action_text: 'do i-named-owner',
      owner_label: 'Dr. K',
      owner_profile_id: NAMED_OWNER,
      owner_name: 'Owner Person',
      due_date: '2026-10-01',
      status: 'open',
      band: 'yours',
    });
  });

  it('a cancelled booking does not tell an outsider it was cancelled', async () => {
    bookingB1().status = 'cancelled';
    const group = await ownerGroup();
    expect(group.booking_status).toBeNull();
    expect(JSON.stringify(group)).not.toContain('cancelled');
  });

  it('the invited attendee, matched by profile id, gets the header', async () => {
    bookingB1().attendee_profile_id = NAMED_OWNER;
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(true);
    expect(group).toMatchObject({
      booking_uid: 'uid-1',
      attendee_name: 'Asha',
      start_time: '2026-09-20T05:00:00Z',
      booking_status: 'completed',
      meeting_title: 'Review',
      viewer_is_host: false,
    });
  });

  it('the invited attendee, matched by email (case and outer spaces ignored), gets the header', async () => {
    bookingB1().attendee_email = 'Owner@JKKN.ac.in';
    tables.profiles.find((p) => p.id === NAMED_OWNER)!.email = '  owner@jkkn.ac.in ';
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(true);
    expect(group.meeting_title).toBe('Review');
    expect(group.attendee_name).toBe('Asha');
  });

  it('an empty email matches nobody, even an empty attendee email', async () => {
    bookingB1().attendee_email = '';
    tables.profiles.find((p) => p.id === NAMED_OWNER)!.email = '';
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(false);
    for (const f of HEADER_FIELDS) expect(group[f]).toBeNull();
  });

  it('a co-host of the booking’s meeting type gets the header', async () => {
    tables.meeting_type_cohosts = [{ id: 'c-1', meeting_type_id: 't-1', cohost_profile_id: NAMED_OWNER }];
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(true);
    expect(group.meeting_title).toBe('Review');
  });

  it('a co-host of a DIFFERENT meeting type does not', async () => {
    tables.meeting_type_cohosts = [{ id: 'c-2', meeting_type_id: 't-2', cohost_profile_id: NAMED_OWNER }];
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(false);
    expect(group.meeting_title).toBeNull();
  });

  it('SOMEONE ELSE being a co-host of that type does not let the viewer in', async () => {
    tables.meeting_type_cohosts = [{ id: 'c-3', meeting_type_id: 't-1', cohost_profile_id: OTHER_HOST }];
    const group = await ownerGroup();
    expect(group.viewer_invited).toBe(false);
  });

  it('an outsider’s group sorts by its own newest follow-up, not to the bottom', async () => {
    // NAMED_OWNER also hosts an older meeting of their own.
    tables.meeting_bookings.push({ id: 'b-own', uid: 'uid-own', attendee_name: 'Deepa', attendee_email: 'deepa@example.com', attendee_profile_id: null, start_time: '2026-09-01T05:00:00Z', status: 'completed', host_profile_id: NAMED_OWNER, meeting_type_id: null });
    tables.meeting_action_items.push(item('i-own', { booking_id: 'b-own', host_profile_id: NAMED_OWNER, created_at: '2026-09-01T09:00:00Z' }));
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, NAMED_OWNER);
    expect(res.data!.map((g) => [g.booking_id, g.viewer_invited])).toEqual([
      ['b-1', false],
      ['b-own', true],
    ]);
  });

  it('the host always gets the header and the link rights', async () => {
    const res = await MeetingActionItemService.listForProfile(fakeClient() as never, HOST);
    const b1 = res.data!.find((g) => g.booking_id === 'b-1')!;
    expect(b1.viewer_invited).toBe(true);
    expect(b1.viewer_is_host).toBe(true);
    expect(b1.booking_uid).toBe('uid-1');
    // created_at is only a server-side sort key — it crosses for nobody.
    for (const it of b1.items) expect(it).not.toHaveProperty('created_at');
  });
});

describe('isInInvitedSet — the code copy of fn_can_view_meeting_note', () => {
  const base = {
    host_profile_id: HOST,
    attendee_profile_id: null,
    attendee_email: 'asha@example.com',
    meeting_type_id: 't-1',
  };
  const viewer = (over: Partial<{ email: string | null; cohost: string[] }> = {}) => ({
    profileId: NAMED_OWNER,
    email: over.email ?? 'owner@jkkn.ac.in',
    cohostTypeIds: new Set(over.cohost ?? []),
  });

  it('being named as an owner is not one of the rules', () => {
    expect(isInInvitedSet(base, viewer())).toBe(false);
  });
  it('a null viewer email never matches', () => {
    expect(isInInvitedSet({ ...base, attendee_email: '' }, { ...viewer(), email: null })).toBe(false);
  });
  it('only SPACES are trimmed, as SQL btrim does', () => {
    expect(isInInvitedSet({ ...base, attendee_email: 'owner@jkkn.ac.in' }, viewer({ email: ' owner@jkkn.ac.in ' }))).toBe(true);
    expect(isInInvitedSet({ ...base, attendee_email: 'owner@jkkn.ac.in' }, viewer({ email: '\towner@jkkn.ac.in' }))).toBe(false);
  });
  it('a booking with no meeting type has no co-hosts', () => {
    expect(isInInvitedSet({ ...base, meeting_type_id: null }, viewer({ cohost: ['t-1'] }))).toBe(false);
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
