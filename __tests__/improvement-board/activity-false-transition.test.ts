/**
 * The activity log must not claim a status change that did not happen.
 *
 * PRODUCTION SHAPE THIS GUARDS (read live 2026-09-12, project kvizhngldtiuufknvehv):
 * 17 of the 46 rows in `improvement_idea_activity` carry from_status = to_status
 * with BOTH non-null — filed 6 Aug through 2 Sep, every one action='status_change'
 * (under_review x12, withdrawn x3, approved x1, rejected x1). The old guard was a
 * presence check, `if (a.from_status && a.to_status)`, so two equal non-null values
 * passed it and rendered "moved it from Under Review to Under Review" on 37% of the
 * log. A NULL would have fallen through and shown nothing, which is honestly
 * invisible; equal values produced a confident falsehood instead.
 *
 * The rows are NOT repairable — 16 of the 17 are the only activity row their idea
 * has, so no predecessor exists to reconstruct the real from_status from. That is
 * why suppressing the claim is the entire fix, and why this test asserts the
 * fallback wording rather than a corrected transition.
 */
import { describe, it, expect } from 'vitest';
import { formatAction } from '@/app/(routes)/improvement-board/_components/idea-detail-dialog';
import type { ImprovementIdeaActivityEnriched } from '@/lib/services/improvement/improvement-service';

function activity(
  over: Partial<ImprovementIdeaActivityEnriched>
): ImprovementIdeaActivityEnriched {
  return {
    id: 'act-1',
    idea_id: 'idea-1',
    actor_id: 'user-1',
    actor_name: 'A Person',
    action: 'status_change',
    from_status: null,
    to_status: null,
    note: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over
  } as ImprovementIdeaActivityEnriched;
}

describe('formatAction — a transition is claimed only when one happened', () => {
  it('states the move when the two statuses genuinely differ', () => {
    const out = formatAction(
      activity({ from_status: 'logged', to_status: 'under_review' })
    );
    expect(out).toMatch(/^moved it from .+ to .+$/);
    expect(out).not.toMatch(/from (.+) to \1$/);
  });

  it('never says "moved it from X to X" when the statuses are equal', () => {
    // The exact production shape: 12 of the 17 corrupt rows look like this.
    const out = formatAction(
      activity({ from_status: 'under_review', to_status: 'under_review' })
    );
    expect(out).not.toContain('moved it from');
    // to_status is still trustworthy on these rows — the defect wrote the NEW
    // status into from_status, it did not corrupt the destination.
    expect(out).toBe('set status to Under Review');
  });

  it('covers every equal-status pair actually present in production', () => {
    for (const s of ['under_review', 'withdrawn', 'approved', 'rejected'] as const) {
      const out = formatAction(activity({ from_status: s, to_status: s }));
      expect(out, `equal pair ${s} must not claim a move`).not.toContain(
        'moved it from'
      );
    }
  });

  it('still renders nothing misleading when from_status is NULL', () => {
    const out = formatAction(
      activity({ from_status: null, to_status: 'approved' })
    );
    expect(out).toBe('set status to Approved');
  });

  it('falls back to the action name when neither status is set', () => {
    const out = formatAction(
      activity({ action: 'idea_assigned', from_status: null, to_status: null })
    );
    expect(out).toBe('idea assigned');
  });
});
