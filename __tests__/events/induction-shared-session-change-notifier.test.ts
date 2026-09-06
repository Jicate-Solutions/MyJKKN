// The D10 host-edit notice: what it detects, who it addresses, and — the point
// of this PR — that it sends NOTHING while the switch is off.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  SHARED_SESSION_EDIT_NOTIFY_ENV,
  isSharedSessionEditNotifyEnabled,
  diffSharedSession,
  planSharedSessionNotices,
  notifyJoiningCollegesOfHostEdit,
  type SharedSessionAudienceRow,
  type SharedSessionSnapshot,
} from '@/lib/services/induction/shared-session-change-notifier';

const HOST_INSTITUTION = 'b0b8a724-7c65-4f07-8047-2a38e8100ad5';
const JOINING_INSTITUTION = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const SESSION_ID = '11ea24b3-7290-4e99-a375-c74905c71053';
const EVENT_ID = 'd0d995a9-8ab4-4ee8-a90b-e63f42a29d46';

const BEFORE: SharedSessionSnapshot = {
  start_at: '2026-06-24T04:30:00+00:00',
  end_at: '2026-06-24T06:30:00+00:00',
  venue_text: 'Vibrant Arangam',
  speaker_text: 'Principal',
};

/** Only the joining college's coordinators — mirrors what the DEFINER RPC
 *  returned in the live rehearsal (host rows: 0). */
const AUDIENCE: SharedSessionAudienceRow[] = [
  {
    recipient_id: 'r1',
    recipient_name: 'Joining Coordinator One',
    recipient_email: 'one@jkkn.ac.in',
    joining_institution_id: JOINING_INSTITUTION,
    joining_institution_name: 'JKKN College of Engineering and Technology',
  },
  {
    recipient_id: 'r2',
    recipient_name: 'Joining Coordinator Two',
    recipient_email: 'two@jkkn.ac.in',
    joining_institution_id: JOINING_INSTITUTION,
    joining_institution_name: 'JKKN College of Engineering and Technology',
  },
];

/** Minimal service-role client double. Records every write attempt so the test
 *  can assert on ZERO of them. */
function fakeAdmin(audience: SharedSessionAudienceRow[]) {
  const writes: string[] = [];
  return {
    writes,
    client: {
      rpc: async (fn: string) => {
        if (fn === 'fn_induction_shared_session_change_audience') {
          return { data: audience, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
      },
      from: (table: string) => {
        writes.push(table);
        throw new Error(`the notifier must not touch ${table} while the switch is off`);
      },
    } as any,
  };
}

describe('induction shared-session host-edit notice (D10)', () => {
  const original = process.env[SHARED_SESSION_EDIT_NOTIFY_ENV];

  beforeEach(() => { delete process.env[SHARED_SESSION_EDIT_NOTIFY_ENV]; });
  afterEach(() => {
    if (original === undefined) delete process.env[SHARED_SESSION_EDIT_NOTIFY_ENV];
    else process.env[SHARED_SESSION_EDIT_NOTIFY_ENV] = original;
    vi.restoreAllMocks();
  });

  it('is off unless the switch is explicitly "on"', () => {
    expect(isSharedSessionEditNotifyEnabled()).toBe(false);
    process.env[SHARED_SESSION_EDIT_NOTIFY_ENV] = 'true';
    expect(isSharedSessionEditNotifyEnabled()).toBe(false);
    process.env[SHARED_SESSION_EDIT_NOTIFY_ENV] = '1';
    expect(isSharedSessionEditNotifyEnabled()).toBe(false);
    process.env[SHARED_SESSION_EDIT_NOTIFY_ENV] = 'ON';
    expect(isSharedSessionEditNotifyEnabled()).toBe(true);
  });

  it('detects exactly the three fields D10 names', () => {
    const after = { ...BEFORE, start_at: '2026-06-24T06:30:00+00:00', end_at: '2026-06-24T08:30:00+00:00' };
    expect(diffSharedSession(BEFORE, after).map((c) => c.field)).toEqual(['time']);

    expect(diffSharedSession(BEFORE, { ...BEFORE, venue_text: 'Hall B' }).map((c) => c.field))
      .toEqual(['venue']);
    expect(diffSharedSession(BEFORE, { ...BEFORE, speaker_text: 'Someone else' }).map((c) => c.field))
      .toEqual(['speaker']);

    const all = diffSharedSession(BEFORE, {
      start_at: '2026-06-24T06:30:00+00:00',
      end_at: '2026-06-24T08:30:00+00:00',
      venue_text: 'Hall B',
      speaker_text: 'Someone else',
    });
    expect(all.map((c) => c.field)).toEqual(['time', 'venue', 'speaker']);
  });

  it('does not fire on a no-op save, or on a differently-written same instant', () => {
    expect(diffSharedSession(BEFORE, { ...BEFORE })).toEqual([]);
    // Same moment, different offset notation — must not read as a reschedule.
    expect(diffSharedSession(BEFORE, { ...BEFORE, start_at: '2026-06-24T10:00:00+05:30' })).toEqual([]);
    // Trailing whitespace is not a venue change.
    expect(diffSharedSession(BEFORE, { ...BEFORE, venue_text: 'Vibrant Arangam  ' })).toEqual([]);
  });

  it('addresses the joining college only — never the host', () => {
    const changes = diffSharedSession(BEFORE, { ...BEFORE, venue_text: 'Hall B' });
    const planned = planSharedSessionNotices(SESSION_ID, 'Inaugural Session', EVENT_ID, AUDIENCE, changes);

    expect(planned).toHaveLength(2);
    expect(planned.every((p) => p.joiningInstitutionId === JOINING_INSTITUTION)).toBe(true);
    expect(planned.some((p) => p.joiningInstitutionId === HOST_INSTITUTION)).toBe(false);
    expect(planned[0].url).toBe(`/events/induction/${EVENT_ID}`);
    // One key per recipient, so two coordinators are two cards, not one.
    expect(new Set(planned.map((p) => p.idempotencyKey)).size).toBe(2);
  });

  it('re-saving the same values reuses the key; a real change makes a new one', () => {
    const v1 = diffSharedSession(BEFORE, { ...BEFORE, venue_text: 'Hall B' });
    const v2 = diffSharedSession(BEFORE, { ...BEFORE, venue_text: 'Hall C' });
    const k1 = planSharedSessionNotices(SESSION_ID, 't', EVENT_ID, AUDIENCE, v1)[0].idempotencyKey;
    const k1again = planSharedSessionNotices(SESSION_ID, 't', EVENT_ID, AUDIENCE, v1)[0].idempotencyKey;
    const k2 = planSharedSessionNotices(SESSION_ID, 't', EVENT_ID, AUDIENCE, v2)[0].idempotencyKey;
    expect(k1).toBe(k1again);
    expect(k1).not.toBe(k2);
  });

  it('SENDS NOTHING while the switch is off — plan only, zero writes', async () => {
    const { client, writes } = fakeAdmin(AUDIENCE);
    const outcome = await notifyJoiningCollegesOfHostEdit({
      admin: client,
      sessionId: SESSION_ID,
      sessionTitle: 'Inaugural Session',
      eventId: EVENT_ID,
      before: BEFORE,
      after: { ...BEFORE, venue_text: 'Hall B', speaker_text: 'Someone else' },
    });

    expect(outcome.dispatched).toBe(false);
    expect(outcome.results).toEqual([]);
    // The plan is fully built — the mechanism exists, it is just not firing.
    expect(outcome.planned).toHaveLength(2);
    expect(outcome.changes.map((c) => c.field)).toEqual(['venue', 'speaker']);
    // `from()` throws on contact; an empty list proves no table was touched.
    expect(writes).toEqual([]);
  });

  it('does nothing at all when nothing a joining college cares about changed', async () => {
    const { client } = fakeAdmin(AUDIENCE);
    const outcome = await notifyJoiningCollegesOfHostEdit({
      admin: client,
      sessionId: SESSION_ID,
      sessionTitle: 'Inaugural Session',
      eventId: EVENT_ID,
      before: BEFORE,
      after: { ...BEFORE },
    });
    expect(outcome.dispatched).toBe(false);
    expect(outcome.planned).toEqual([]);
    expect(outcome.changes).toEqual([]);
  });
});
