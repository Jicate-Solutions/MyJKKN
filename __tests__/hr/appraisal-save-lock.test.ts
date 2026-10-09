// =====================================================================
// HR appraisals: the second save is stopped, nothing is lost
// =====================================================================
// Director ruling, 1 Oct 2026: if the committee and the Director save the
// same appraisal at the same time, "whoever saves second sees 'someone else
// just changed this, reload and try again'. Nothing is lost." Before this,
// sendBack() read the committee's payload, added a note and wrote the whole
// payload back, so a committee save in between was silently overwritten.
//
// Every writer now saves only WHERE updated_at is still the value the
// person's screen showed, and stamps a new updated_at itself.
// =====================================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  APPRAISAL_CHANGED_MESSAGE,
  PerformanceReviewService,
} from '@/lib/services/hr/performance-review-service';
import { isMovedOnError } from '@/lib/hr/appraisal-team-board';

const SHOWN = '2026-10-01T10:00:00.000Z';
const LATER = '2026-10-01T10:05:00.000Z';

/** One appraisal row. `changedUnderneath` = someone saved between our read and our write. */
function fakeClient(row: Record<string, unknown>, opts: { changedUnderneath?: boolean } = {}) {
  const sent: { update: Record<string, unknown> | null; filters: Array<[string, unknown]> } = { update: null, filters: [] };
  const client = {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => {
      if (table === 'staff') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { institution_id: null }, error: null }) }) }) };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          sent.update = payload;
          const chain = {
            eq: (k: string, v: unknown) => { sent.filters.push([k, v]); return chain; },
            select: () => ({
              maybeSingle: async () => ({
                data: opts.changedUnderneath ? null : { ...row, ...payload },
                error: null,
              }),
            }),
          };
          return chain;
        },
      };
    },
  };
  return { client: client as never, sent };
}

const committeeDone = {
  id: 'r1',
  staff_id: 's1',
  status: 'sedc_reviewed',
  updated_at: SHOWN,
  sedc_review_jsonb: { ratings: { teaching: 'meets', research: 'meets', service: 'meets', collegiality: 'meets' } },
};

describe('the second save is stopped', () => {
  it('saves only where updated_at is still what the screen showed, and stamps a new one', async () => {
    const { client, sent } = fakeClient(committeeDone);
    await PerformanceReviewService.sendBack(client, 'r1', 'supervisor_reviewed', 'Look at research again.', SHOWN);
    expect(sent.filters).toEqual([['id', 'r1'], ['updated_at', SHOWN]]);
    expect(typeof sent.update?.updated_at).toBe('string');
    expect(sent.update?.updated_at).not.toBe(SHOWN);
  });

  it('refuses before writing when the screen showed an older version than the database holds', async () => {
    const { client, sent } = fakeClient({ ...committeeDone, updated_at: LATER });
    await expect(
      PerformanceReviewService.sendBack(client, 'r1', 'supervisor_reviewed', 'Look at research again.', SHOWN),
    ).rejects.toThrow(APPRAISAL_CHANGED_MESSAGE);
    expect(sent.update).toBeNull();
  });

  it('refuses when someone saved between the read and the write (no row matched)', async () => {
    const { client } = fakeClient(committeeDone, { changedUnderneath: true });
    await expect(
      PerformanceReviewService.finalApprove(client, 'r1', {
        final_remarks: 'ok',
        approver_profile_id: 'dir-1',
        expected_updated_at: SHOWN,
      }),
    ).rejects.toThrow(APPRAISAL_CHANGED_MESSAGE);
  });

  it('the committee save and the supervisor save are locked the same way', async () => {
    const atSupervisor = { ...committeeDone, status: 'supervisor_reviewed' };
    const a = fakeClient(atSupervisor, { changedUnderneath: true });
    await expect(
      PerformanceReviewService.submitSedcReview(a.client, 'r1', { ratings: {} }, SHOWN),
    ).rejects.toThrow(APPRAISAL_CHANGED_MESSAGE);

    const atSelf = { ...committeeDone, status: 'self_submitted' };
    const b = fakeClient(atSelf, { changedUnderneath: true });
    await expect(
      PerformanceReviewService.submitSupervisorReview(b.client, 'r1', { ratings: {} }, SHOWN),
    ).rejects.toThrow(APPRAISAL_CHANGED_MESSAGE);
  });

  it('with no version passed, it still locks on the version it just read', async () => {
    const { client, sent } = fakeClient(committeeDone);
    await PerformanceReviewService.sendBack(client, 'r1', 'supervisor_reviewed', 'Look at research again.');
    expect(sent.filters).toContainEqual(['updated_at', SHOWN]);
  });

  it('the team board treats it as "this moved on, reload"', () => {
    expect(isMovedOnError(new Error(APPRAISAL_CHANGED_MESSAGE))).toBe(true);
  });
});

describe('both screens pass the version they showed', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
  it('the committee / Director panel', () => {
    const src = read('features/hr/appraisal/review-decision-panel.tsx');
    expect(src.match(/review\.updated_at/g)?.length).toBe(3);
  });
  it('the head of department team page', () => {
    const src = read('app/(routes)/hr/performance-reviews/team/page.tsx');
    expect(src.match(/selected\.updated_at/g)?.length).toBe(2);
  });
});

describe('Sign off shows only for the Director list (ruling 1 Oct 2026)', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app/(routes)/hr/admin/performance-reviews/cycles/[id]/page.tsx'), 'utf8');
  it('asks the database who is the Director, and starts hidden', () => {
    expect(src).toMatch(/PerformanceReviewService\.isTheDirector\(supabase\)/);
    expect(src).toMatch(/useState\(false\)/);
  });
  it('the Director check fails closed', async () => {
    const answer = (data: unknown, error: unknown) =>
      ({ rpc: async (name: string) => (name === 'fn_is_the_director' ? { data, error } : { data: null, error: { message: 'wrong rpc' } }) }) as never;
    await expect(PerformanceReviewService.isTheDirector(answer(true, null))).resolves.toBe(true);
    await expect(PerformanceReviewService.isTheDirector(answer(false, null))).resolves.toBe(false);
    await expect(PerformanceReviewService.isTheDirector(answer(null, null))).resolves.toBe(false);
    await expect(PerformanceReviewService.isTheDirector(answer(true, { message: 'boom' }))).resolves.toBe(false);
  });
  it('a waiting sign-off offers its button only to the Director list', () => {
    expect(src).toMatch(/r\.status === 'sedc_reviewed' && isTheDirector/);
    expect(src).toMatch(/Waiting for the Director/);
  });
});
