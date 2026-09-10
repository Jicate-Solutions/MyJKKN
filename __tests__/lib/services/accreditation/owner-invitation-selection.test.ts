// __tests__/lib/services/accreditation/owner-invitation-selection.test.ts
// ============================================================================
// Which pending ownership rows the invitation cron may still announce.
//
// Assignment is ownership (Director, 2026-09-08), so `pending` never clears.
// These fixtures state who should and should not be told — a test cannot pass
// merely because it agrees with the implementation's own set arithmetic.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  priorInviteFromNotification,
  selectAssignmentsToInvite,
  type PendingAssignment,
} from '@/lib/services/accreditation/owner-invitation-selection';

const INST = '11111111-1111-1111-1111-111111111111';
const PRIYA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RAVI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function row(id: string, owner: string | null, over: Partial<PendingAssignment> = {}): PendingAssignment {
  return { id, owner_user_id: owner, institution_id: INST, body_code: 'NAAC', metric_code: null, ...over };
}

const ids = (rows: PendingAssignment[]) => rows.map((r) => r.id);

describe('selectAssignmentsToInvite', () => {
  it('returns nothing, and excludes nothing, when there is nothing pending', () => {
    const s = selectAssignmentsToInvite({ pending: [], liveEvents: [], priorInvites: [] });
    expect(s.toInvite).toEqual([]);
    expect(s.excluded.announcedByChange).toEqual([]);
    expect(s.excluded.alreadyInvited).toEqual([]);
  });

  it('invites a pending row nobody has told its owner about', () => {
    const s = selectAssignmentsToInvite({ pending: [row('r1', PRIYA)], liveEvents: [], priorInvites: [] });
    expect(ids(s.toInvite)).toEqual(['r1']);
  });

  it('stays silent for a back-filled legacy row whose owner was already invited', () => {
    // The backfill wrote a note on its event, so the route passes no live event
    // for it — the earlier invitation is what keeps it from being re-sent.
    const s = selectAssignmentsToInvite({
      pending: [row('legacy', PRIYA)],
      liveEvents: [],
      priorInvites: [{ user_ids: [PRIYA], assignment_ids: ['legacy'] }],
    });
    expect(s.toInvite).toEqual([]);
    expect(ids(s.excluded.alreadyInvited)).toEqual(['legacy']);
  });

  it('stays silent for a row a live assigned event already hands to its owner', () => {
    const s = selectAssignmentsToInvite({
      pending: [row('new', PRIYA)],
      liveEvents: [{ owner_row_id: 'new', to_user_id: PRIYA }],
      priorInvites: [],
    });
    expect(s.toInvite).toEqual([]);
    expect(ids(s.excluded.announcedByChange)).toEqual(['new']);
  });

  it('counts a row matching both exclusions once, under announcedByChange', () => {
    const s = selectAssignmentsToInvite({
      pending: [row('both', PRIYA)],
      liveEvents: [{ owner_row_id: 'both', to_user_id: PRIYA }],
      priorInvites: [{ user_ids: [PRIYA], assignment_ids: ['both'] }],
    });
    expect(ids(s.excluded.announcedByChange)).toEqual(['both']);
    expect(s.excluded.alreadyInvited).toEqual([]);
  });

  it('still invites a row reassigned by an event-less write to an owner never invited', () => {
    // The only event for this row handed it to Priya. It now belongs to Ravi,
    // and nothing recorded the move — Ravi has heard nothing.
    const s = selectAssignmentsToInvite({
      pending: [row('moved', RAVI)],
      liveEvents: [{ owner_row_id: 'moved', to_user_id: PRIYA }],
      priorInvites: [],
    });
    expect(ids(s.toInvite)).toEqual(['moved']);
  });

  it('still invites a row that an earlier invitation listed for a DIFFERENT owner', () => {
    const s = selectAssignmentsToInvite({
      pending: [row('moved', RAVI)],
      liveEvents: [],
      priorInvites: [{ user_ids: [PRIYA], assignment_ids: ['moved'] }],
    });
    expect(ids(s.toInvite)).toEqual(['moved']);
    expect(s.excluded.alreadyInvited).toEqual([]);
  });

  it('ignores an event that names no owner, such as a clear or a decline', () => {
    const s = selectAssignmentsToInvite({
      pending: [row('r1', PRIYA)],
      liveEvents: [
        { owner_row_id: 'r1', to_user_id: null },
        { owner_row_id: null, to_user_id: PRIYA },
      ],
      priorInvites: [],
    });
    expect(ids(s.toInvite)).toEqual(['r1']);
  });

  it('leaves a row with no owner out of every list', () => {
    const s = selectAssignmentsToInvite({ pending: [row('orphan', null)], liveEvents: [], priorInvites: [] });
    expect(s.toInvite).toEqual([]);
    expect(s.excluded.announcedByChange).toEqual([]);
    expect(s.excluded.alreadyInvited).toEqual([]);
  });

  it('only drops the rows already covered, and invites the rest of the same owner', () => {
    const s = selectAssignmentsToInvite({
      pending: [row('old', PRIYA), row('fresh', PRIYA), row('announced', PRIYA)],
      liveEvents: [{ owner_row_id: 'announced', to_user_id: PRIYA }],
      priorInvites: [{ user_ids: [PRIYA], assignment_ids: ['old'] }],
    });
    expect(ids(s.toInvite)).toEqual(['fresh']);
    expect(ids(s.excluded.alreadyInvited)).toEqual(['old']);
    expect(ids(s.excluded.announcedByChange)).toEqual(['announced']);
  });

  it('orders every list by id regardless of input order', () => {
    const pending = [row('c', PRIYA), row('a', RAVI), row('b', PRIYA), row('e', PRIYA), row('d', RAVI)];
    const liveEvents = [
      { owner_row_id: 'e', to_user_id: PRIYA },
      { owner_row_id: 'd', to_user_id: RAVI },
    ];
    const first = selectAssignmentsToInvite({ pending, liveEvents, priorInvites: [] });
    const second = selectAssignmentsToInvite({ pending: [...pending].reverse(), liveEvents, priorInvites: [] });
    expect(ids(first.toInvite)).toEqual(['a', 'b', 'c']);
    expect(ids(first.excluded.announcedByChange)).toEqual(['d', 'e']);
    expect(ids(second.toInvite)).toEqual(ids(first.toInvite));
    expect(ids(second.excluded.announcedByChange)).toEqual(ids(first.excluded.announcedByChange));
  });
});

describe('priorInviteFromNotification', () => {
  const key = `accred_owner_invite:${PRIYA}:r1,r2`;

  it('reads the recipients and rows the cron wrote', () => {
    expect(
      priorInviteFromNotification({
        idempotency_key: key,
        targeting: { user_ids: [PRIYA] },
        metadata: { assignment_ids: ['r1', 'r2'], assignment_count: 2 },
      }),
    ).toEqual({ user_ids: [PRIYA], assignment_ids: ['r1', 'r2'] });
  });

  it('falls back to the idempotency key when the JSON columns do not carry them', () => {
    expect(priorInviteFromNotification({ idempotency_key: key, targeting: null, metadata: {} })).toEqual({
      user_ids: [PRIYA],
      assignment_ids: ['r1', 'r2'],
    });
  });

  it('refuses a row that is not an owner invitation', () => {
    expect(
      priorInviteFromNotification({
        idempotency_key: `accred_ownership_change:event-1:${PRIYA}`,
        targeting: { user_ids: [PRIYA] },
        metadata: { assignment_ids: ['r1'] },
      }),
    ).toBeNull();
    expect(priorInviteFromNotification({ idempotency_key: null })).toBeNull();
  });
});
