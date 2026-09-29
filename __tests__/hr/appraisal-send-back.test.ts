// =====================================================================
// HR — sending an appraisal back, and who gets to read the note
// =====================================================================
// Round-3 review: the database always allowed a head of department to
// return a self-appraisal to the person, but no screen offered it. Adding
// the button exposed a second problem: the committee's note to the head
// and the head's note to the person are both stamped on the head's
// payload, so a note could be shown under the wrong sender's name.
// `sent_back_by` records the sender, and every screen checks it.
// =====================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseSentBackReason, sentBackByFor } from '@/lib/hr/appraisal-ratings';
import { PerformanceReviewService } from '@/lib/services/hr/performance-review-service';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** A stand-in client: one row, and it records the last update sent. */
function fakeClient(row: Record<string, unknown>) {
  const sent: { update: Record<string, unknown> | null } = { update: null };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        sent.update = payload;
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { ...row, ...payload }, error: null }) }),
          }),
        };
      },
    }),
  };
  return { client: client as never, sent };
}

const base = {
  id: 'r1',
  staff_id: 's1',
  cycle_id: 'c1',
  self_appraisal_jsonb: { ratings: {} },
  supervisor_review_jsonb: { validation_notes: 'kept' },
  sedc_review_jsonb: { normalisation_notes: 'kept' },
};

describe('who is sending back', () => {
  it('names the sender from the status the appraisal is leaving', () => {
    expect(sentBackByFor('self_submitted')).toBe('head');
    expect(sentBackByFor('supervisor_reviewed')).toBe('committee');
    expect(sentBackByFor('sedc_reviewed')).toBe('director');
    expect(sentBackByFor('draft')).toBeNull();
    expect(sentBackByFor('final_approved')).toBeNull();
  });
});

describe('reading a note', () => {
  const note = { sent_back_reason: '  Add the evidence for March, with dates.  ', sent_back_by: 'head' };

  it('shows the note to the reader it was meant for', () => {
    expect(parseSentBackReason(note, 'head')).toBe('Add the evidence for March, with dates.');
  });

  it('never shows a note under another sender’s name', () => {
    expect(parseSentBackReason(note, 'committee')).toBe('');
    expect(parseSentBackReason(note, 'director')).toBe('');
  });

  it('shows nothing when the sender was never recorded', () => {
    expect(parseSentBackReason({ sent_back_reason: 'x' }, 'head')).toBe('');
  });

  it('shows nothing for an empty or odd payload', () => {
    expect(parseSentBackReason(null, 'head')).toBe('');
    expect(parseSentBackReason([], 'head')).toBe('');
    expect(parseSentBackReason({ sent_back_by: 'head', sent_back_reason: 7 }, 'head')).toBe('');
  });
});

describe('sendBack stamps the note where the next reader will look', () => {
  it('head returns it to the person: head’s payload, marked as the head’s', async () => {
    const { client, sent } = fakeClient({ ...base, status: 'self_submitted' });
    await PerformanceReviewService.sendBack(client, 'r1', 'draft', 'Add evidence.');
    expect(sent.update?.status).toBe('draft');
    const p = sent.update?.supervisor_review_jsonb as Record<string, unknown>;
    expect(p.sent_back_by).toBe('head');
    expect(p.sent_back_reason).toBe('Add evidence.');
    expect(p.validation_notes).toBe('kept');
    expect(sent.update).not.toHaveProperty('self_appraisal_jsonb');
    expect(parseSentBackReason(p, 'head')).toBe('Add evidence.');
  });

  it('committee returns it to the head: head’s payload, marked as the committee’s', async () => {
    const { client, sent } = fakeClient({ ...base, status: 'supervisor_reviewed' });
    await PerformanceReviewService.sendBack(client, 'r1', 'self_submitted', 'Recheck Service.');
    const p = sent.update?.supervisor_review_jsonb as Record<string, unknown>;
    expect(p.sent_back_by).toBe('committee');
    // The person must not see the committee's note to the head as their own.
    expect(parseSentBackReason(p, 'head')).toBe('');
    expect(parseSentBackReason(p, 'committee')).toBe('Recheck Service.');
  });

  it('Director returns it to the committee: committee’s payload, marked as the Director’s', async () => {
    const { client, sent } = fakeClient({ ...base, status: 'sedc_reviewed' });
    await PerformanceReviewService.sendBack(client, 'r1', 'supervisor_reviewed', 'Explain the Below.');
    const p = sent.update?.sedc_review_jsonb as Record<string, unknown>;
    expect(p.sent_back_by).toBe('director');
    expect(p.normalisation_notes).toBe('kept');
    expect(sent.update).not.toHaveProperty('supervisor_review_jsonb');
  });

  it('refuses a send-back with no note', async () => {
    const { client, sent } = fakeClient({ ...base, status: 'self_submitted' });
    await expect(PerformanceReviewService.sendBack(client, 'r1', 'draft', '   ')).rejects.toThrow();
    expect(sent.update).toBeNull();
  });
});

describe('every screen that can send back, and every screen that shows the note', () => {
  const team = read('app/(routes)/hr/performance-reviews/team/page.tsx');
  const mine = read('app/(routes)/hr/performance-reviews/page.tsx');
  const panel = read('features/hr/appraisal/review-decision-panel.tsx');

  it('the head’s screen offers "Send back to the person", sending the appraisal to draft', () => {
    expect(team).toContain('Send back to the person');
    expect(team).toMatch(/sendBack\(\s*supabase,\s*selected\.id,\s*'draft',/);
  });

  it('the person sees only the head’s note; the head sees only the committee’s', () => {
    expect(mine).toContain("parseSentBackReason(review.supervisor_review_jsonb, 'head')");
    expect(team).toContain("parseSentBackReason(selected.supervisor_review_jsonb, 'committee')");
  });

  it('the committee sees the Director’s note', () => {
    expect(panel).toContain("parseSentBackReason(review.sedc_review_jsonb, 'director')");
  });
});

describe('a person can only file into an open round of their own college or the group', () => {
  const sql = read(
    'supabase/migrations/20270501090000_hr_appraisal_cycle_institution_and_writer_policies.sql',
  );
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_hr_appraisal_round_is_open'),
    sql.indexOf('REVOKE EXECUTE ON FUNCTION public.fn_hr_appraisal_round_is_open'),
  );
  const insert = sql.slice(
    sql.indexOf('CREATE POLICY "hr_performance_reviews_self_insert"'),
    sql.indexOf('DROP POLICY IF EXISTS "hr_performance_reviews_self_update"'),
  );
  const update = sql.slice(
    sql.indexOf('CREATE POLICY "hr_performance_reviews_self_update"'),
    sql.indexOf('DROP POLICY IF EXISTS "hr_performance_reviews_hod_update"'),
  );
  const hod = sql.slice(
    sql.indexOf('CREATE POLICY "hr_performance_reviews_hod_update"'),
    sql.indexOf('COMMENT ON TABLE public.hr_performance_reviews'),
  );
  const CALL = 'public.fn_hr_appraisal_round_is_open(cycle_id, staff_id)';

  it('the shared round check requires the round to be open', () => {
    expect(fn).toContain("c.status = 'open'");
    expect(fn).toContain('c.id = p_cycle_id');
  });

  it('the shared round check requires the person’s own college, or every college', () => {
    expect(fn).toContain('c.institution_id IS NULL OR c.institution_id = s.institution_id');
    expect(fn).toContain('s.id = p_staff_id');
  });

  it('runs with the caller’s rights and is closed to signed-out callers', () => {
    expect(fn).toContain('SECURITY INVOKER');
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_hr_appraisal_round_is_open(uuid, uuid) FROM anon, PUBLIC;',
    );
  });

  it('is applied when a person creates an appraisal', () => {
    expect(insert).toContain(CALL);
  });

  it('applies the same round check when a person edits or submits their draft', () => {
    expect(update.slice(update.indexOf('WITH CHECK'))).toContain(CALL);
  });

  it('is no longer written out by hand in any policy, so the copies cannot drift', () => {
    for (const policy of [insert, update, hod]) {
      expect(policy).not.toContain('FROM public.hr_performance_review_cycles');
    }
  });
});

describe('a head cannot act on an appraisal once HR locks the round', () => {
  const sql = read(
    'supabase/migrations/20270501090000_hr_appraisal_cycle_institution_and_writer_policies.sql',
  );
  const hod = sql.slice(
    sql.indexOf('CREATE POLICY "hr_performance_reviews_hod_update"'),
    sql.indexOf('COMMENT ON TABLE public.hr_performance_reviews'),
  );
  const CALL = 'public.fn_hr_appraisal_round_is_open(cycle_id, staff_id)';

  it('checks the round is open on the row the head starts from', () => {
    expect(hod.slice(0, hod.indexOf('WITH CHECK'))).toContain(CALL);
  });

  it('and on the row the head leaves behind', () => {
    expect(hod.slice(hod.indexOf('WITH CHECK'))).toContain(CALL);
  });

  it('the head’s screen disables both actions when the round is not open', () => {
    const team = read('app/(routes)/hr/performance-reviews/team/page.tsx');
    expect(team).toContain("const roundOpen = openCycle?.status === 'open';");
    expect(team).toContain('onClick={submitReview} disabled={submitting || !roundOpen}');
    expect(team).toMatch(/onClick=\{sendBackToPerson\}\s*disabled=\{submitting \|\| !roundOpen\}/);
  });
});

describe('a send-back only ever moves one step backward', () => {
  it.each([
    ['self_submitted', 'supervisor_reviewed', 'a forward move from the head’s queue'],
    ['supervisor_reviewed', 'sedc_reviewed', 'a forward move from the committee’s queue'],
    ['sedc_reviewed', 'final_approved', 'an approval dressed as a send-back'],
    ['supervisor_reviewed', 'draft', 'a skip of two steps'],
    ['draft', 'self_submitted', 'a draft, which has nowhere to go back to'],
    ['final_approved', 'sedc_reviewed', 'a closed appraisal'],
  ])('refuses %s -> %s (%s) and writes nothing', async (from, to) => {
    const { client, sent } = fakeClient({ ...base, status: from });
    await expect(
      PerformanceReviewService.sendBack(client, 'r1', to as never, 'Some reason.'),
    ).rejects.toThrow(/one step back/);
    expect(sent.update).toBeNull();
  });

  it.each([
    ['self_submitted', 'draft'],
    ['supervisor_reviewed', 'self_submitted'],
    ['sedc_reviewed', 'supervisor_reviewed'],
  ])('allows %s -> %s', async (from, to) => {
    const { client, sent } = fakeClient({ ...base, status: from });
    await PerformanceReviewService.sendBack(client, 'r1', to as never, 'Some reason.');
    expect(sent.update?.status).toBe(to);
  });
});
