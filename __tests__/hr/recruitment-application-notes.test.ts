import { describe, expect, it } from 'vitest';

import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

/**
 * The screening note on hr_job_applications is a SINGLE text column shared by
 * two writers: the workspace's screening decisions and the detail page's note
 * editor. Two invariants keep them from destroying each other's work, and both
 * are invisible at the type level — hence these tests.
 *
 *  1. reviewJobApplication treats `reviewNotes` as tri-state. Omitted means
 *     "no opinion" and must leave review_notes out of the UPDATE entirely.
 *     Shipping `?? null` here blanked the note on every shortlist, because only
 *     the reject dialog ever collects one.
 *
 *  2. updateApplicationNotes writes review_notes and NOTHING else — no status,
 *     no reviewed_by, no reviewed_at. Otherwise annotating a pending applicant
 *     would stamp a review that never happened.
 */

type Captured = { table: string; payload: Record<string, unknown> | null };

/**
 * Minimal stand-in for the PostgREST builder, capturing the UPDATE payload.
 * `existingStatus` feeds the pre-flight `select('id, status')` read.
 */
function fakeSupabase(
  row: Record<string, unknown>,
  /** false = the UPDATE matched no row, as when RLS filters it out. */
  updateReturnsRow = true,
) {
  const captured: Captured = { table: '', payload: null };

  const terminal = (data: unknown) => ({
    eq: () => terminal(data),
    select: () => terminal(data),
    single: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
  });

  const client = {
    from(table: string) {
      captured.table = table;
      return {
        select: () => terminal({ id: row.id, status: row.status }),
        update(payload: Record<string, unknown>) {
          captured.payload = payload;
          return terminal(updateReturnsRow ? { ...row, ...payload } : null);
        },
      };
    },
  };

  // The service is typed against SupabaseClient; this fake implements only the
  // two chains it actually walks.
  return { client: client as never, captured };
}

const BASE_ROW = { id: 'app-1', status: 'pending', review_notes: 'existing note' };

describe('reviewJobApplication — screening notes are tri-state', () => {
  it('leaves review_notes untouched when notes are omitted', async () => {
    const { client, captured } = fakeSupabase(BASE_ROW);

    await RecruitmentService.reviewJobApplication(client, 'app-1', 'user-1', 'shortlisted');

    expect(captured.payload).not.toBeNull();
    expect(captured.payload).not.toHaveProperty('review_notes');
    expect(captured.payload!.status).toBe('shortlisted');
  });

  it('writes the note when one is supplied', async () => {
    const { client, captured } = fakeSupabase(BASE_ROW);

    await RecruitmentService.reviewJobApplication(
      client, 'app-1', 'user-1', 'rejected', 'Not enough teaching exposure',
    );

    expect(captured.payload!.review_notes).toBe('Not enough teaching exposure');
  });

  it('clears the note only on an explicit null', async () => {
    const { client, captured } = fakeSupabase(BASE_ROW);

    await RecruitmentService.reviewJobApplication(client, 'app-1', 'user-1', 'reviewed', null);

    expect(captured.payload).toHaveProperty('review_notes', null);
  });

  it('still refuses to screen a promoted application', async () => {
    const { client } = fakeSupabase({ ...BASE_ROW, status: 'promoted' });

    await expect(
      RecruitmentService.reviewJobApplication(client, 'app-1', 'user-1', 'shortlisted'),
    ).rejects.toThrow(/approval pipeline/i);
  });
});

describe('updateApplicationNotes — annotation is not a decision', () => {
  it('writes review_notes and nothing else', async () => {
    const { client, captured } = fakeSupabase(BASE_ROW);

    await RecruitmentService.updateApplicationNotes(client, 'app-1', 'Called — free from Oct');

    expect(captured.payload).toEqual({ review_notes: 'Called — free from Oct' });
    expect(captured.payload).not.toHaveProperty('status');
    expect(captured.payload).not.toHaveProperty('reviewed_at');
    expect(captured.payload).not.toHaveProperty('reviewed_by');
  });

  it('accepts null to clear the note', async () => {
    const { client, captured } = fakeSupabase(BASE_ROW);

    await RecruitmentService.updateApplicationNotes(client, 'app-1', null);

    expect(captured.payload).toEqual({ review_notes: null });
  });

  it('annotates a promoted applicant — no screening guard applies', async () => {
    const { client, captured } = fakeSupabase({ ...BASE_ROW, status: 'promoted' });

    await expect(
      RecruitmentService.updateApplicationNotes(client, 'app-1', 'Joined the pipeline'),
    ).resolves.toBeTruthy();
    expect(captured.payload).toEqual({ review_notes: 'Joined the pipeline' });
  });

  it('surfaces an RLS-filtered update as a permission error, not a silent success', async () => {
    // An UPDATE the policy filters out returns zero rows, not an error.
    const { client } = fakeSupabase(BASE_ROW, false);

    await expect(
      RecruitmentService.updateApplicationNotes(client, 'app-1', 'nope'),
    ).rejects.toThrow(/permission/i);
  });
});
