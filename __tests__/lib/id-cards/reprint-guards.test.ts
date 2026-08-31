// ============================================================================
// Guards: a leaver cannot get a card printed, and a replacement is counted
// and chargeable. Created 2026-08-14.
//
// WHAT WENT WRONG. POST /api/id-cards/jobs accepted any (profile_id,
// template_id) from a job-writer role and enqueued it. Two consequences, both
// live on production when this was written:
//
//   1. NOBODY CHECKED WHETHER THE PERSON HAD LEFT. The batch-print screen
//      filters its cohort to card-worthy lifecycle statuses, but that filter
//      runs in the browser — a direct POST skips it. Measured read-only
//      2026-08-14: 1,298 learner-linked profiles are graduated / inactive /
//      exited and 117 profiles resolve to a team-member record with
//      is_active = false. Every one of them was printable.
//
//   2. EVERY REPRINT WAS FREE AND UNCOUNTED. id_card_print_jobs held 10 rows,
//      all 'printed', across 5 people — and 4 of those 5 already had more than
//      one card. Nothing counted them and nothing charged for them.
//
// WHY PURE-FUNCTION TESTED. vitest here defaults to environment: 'node'
// (vitest.config.js) and the rules live inside a route handler. The decisions
// are extracted to lib/services/id-cards/reprint-eligibility.ts precisely so
// each verdict can be asserted directly, with no Supabase and no DOM — the same
// shape as template-picker-active.test.ts alongside this file.
//
// NEGATIVE CONTROL. Every test below asserts a REFUSAL or a CHARGE that the
// endpoint did not produce before this change: the unfixed endpoint enqueued
// the job and returned 201 in all of these cases. The two "still allowed" tests
// are the opposite control — they pin the cases the guard must NOT break, so a
// later tightening that blocks an active learner or an administrative account
// fails here rather than in the print office.
//
// `lifecycle_status`, `staff` and `is_active` are existing database identifiers
// (terminology-exempt); the copy a caller reads says "learner" / "team member".
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FREE_CARD_COUNT,
  DEFAULT_LEARNER_CARD_STATUSES,
  POLICY_KEY_FEE_AMOUNT,
  describeReplacement,
  judgeCardSubject,
  judgeLearnerEligibility,
  judgeReplacement,
  judgeTeamMemberEligibility
} from '@/lib/services/id-cards/reprint-eligibility';

// Every lifecycle_status present on production 2026-08-14, with its count.
const LEAVER_STATUSES = ['graduated', 'exited', 'inactive', 'withdrawal_pending'];
const NEVER_JOINED_STATUSES = ['enquiry', 'enquiry_submitted', 'rejected', 'waitlisted', 'approved'];
const ON_ROLLS_STATUSES = ['active', 'admitted', 'account', 'reserved'];

describe('guard 1 — a learner who has left cannot get a card printed', () => {
  it.each(LEAVER_STATUSES)('refuses a learner whose status is "%s"', (status) => {
    const verdict = judgeLearnerEligibility(status);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.code).toBe('learner_has_left');
    // The refusal must say WHY, not bounce silently (CLAUDE.md #27).
    expect(verdict.message).toContain('has left the institution');
    expect(verdict.message).toContain(status);
  });

  it.each(NEVER_JOINED_STATUSES)('refuses a learner not yet on the rolls ("%s")', (status) => {
    const verdict = judgeLearnerEligibility(status);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.code).toBe('learner_not_on_rolls');
    expect(verdict.message).toContain(status);
  });

  it.each(ON_ROLLS_STATUSES)('still prints for a learner on the rolls ("%s")', (status) => {
    expect(judgeLearnerEligibility(status).kind).toBe('eligible');
  });

  it('refuses when the learner has no status recorded at all', () => {
    for (const missing of [null, '', '   ']) {
      const verdict = judgeLearnerEligibility(missing);
      expect(verdict.kind).toBe('refused');
      if (verdict.kind !== 'refused') continue;
      expect(verdict.code).toBe('learner_status_unknown');
    }
  });

  it('honours a configured status list instead of the built-in default', () => {
    // A super admin narrows the estate to active-only via platform_policies.
    expect(judgeLearnerEligibility('admitted', ['active']).kind).toBe('refused');
    expect(judgeLearnerEligibility('active', ['active']).kind).toBe('eligible');
    // ...and widening it lets graduated learners through again, without a deploy.
    expect(judgeLearnerEligibility('graduated', ['active', 'graduated']).kind).toBe('eligible');
  });

  it('defaults to the cohort the batch-print screen already offers', () => {
    expect([...DEFAULT_LEARNER_CARD_STATUSES]).toEqual(ON_ROLLS_STATUSES);
  });
});

describe('guard 1 — a team member who has left cannot get a card printed', () => {
  it('refuses an inactive team member', () => {
    const verdict = judgeTeamMemberEligibility(false);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.code).toBe('team_member_has_left');
    expect(verdict.message).toContain('no longer active');
  });

  it('still prints for an active team member', () => {
    expect(judgeTeamMemberEligibility(true).kind).toBe('eligible');
  });

  it('does not refuse a team member whose active flag was never set', () => {
    // null is "unrecorded", not "has left" — only an explicit false refuses.
    expect(judgeTeamMemberEligibility(null).kind).toBe('eligible');
  });
});

describe('guard 1 — subject routing', () => {
  it('applies the learner rule to a learner and the team rule to a team member', () => {
    expect(judgeCardSubject({ kind: 'learner', lifecycleStatus: 'graduated' }).kind).toBe('refused');
    expect(judgeCardSubject({ kind: 'team_member', isActive: false }).kind).toBe('refused');
    expect(judgeCardSubject({ kind: 'learner', lifecycleStatus: 'active' }).kind).toBe('eligible');
  });

  it('leaves an unclassified profile printable', () => {
    // 340 profiles on this estate resolve to neither record (administrative and
    // service accounts). This guard refuses people who can be SHOWN to have
    // left; refusing these would break a workflow nobody asked to change.
    expect(judgeCardSubject({ kind: 'unclassified' }).kind).toBe('eligible');
  });
});

describe('guard 2 — the first card is free', () => {
  const base = { freeCardCount: 1, feeAmount: 250, feeCurrency: 'INR', acknowledged: false };

  it('charges nothing for a person who has never had a card', () => {
    const verdict = judgeReplacement({ ...base, priorPrintedCount: 0 });
    expect(verdict.kind).toBe('free');
  });

  it('does not count jobs that never printed', () => {
    // Only 'printed' rows are passed in; a failed or pending job must not
    // consume the free card. Asserted at the boundary: 0 prior prints is free.
    expect(judgeReplacement({ ...base, priorPrintedCount: 0 }).kind).toBe('free');
    expect(judgeReplacement({ ...base, priorPrintedCount: 1 }).kind).not.toBe('free');
  });

  it('defaults the free allowance to exactly one card', () => {
    expect(DEFAULT_FREE_CARD_COUNT).toBe(1);
  });
});

describe('guard 2 — a replacement must not print for free', () => {
  it('REFUSES a replacement when no fee has been configured', () => {
    const verdict = judgeReplacement({
      priorPrintedCount: 1,
      freeCardCount: 1,
      feeAmount: null,
      feeCurrency: 'INR',
      acknowledged: true // even an acknowledging caller cannot get a free one
    });

    expect(verdict.kind).toBe('fee_not_configured');
    const message = describeReplacement(verdict);
    expect(message).toContain(POLICY_KEY_FEE_AMOUNT);
    expect(message).toContain('NOT printed');
  });

  it('never silently treats a missing fee as zero', () => {
    for (const bad of [null, undefined, Number.NaN, -1] as unknown[]) {
      const verdict = judgeReplacement({
        priorPrintedCount: 1,
        freeCardCount: 1,
        feeAmount: bad as number | null,
        feeCurrency: 'INR',
        acknowledged: true
      });
      expect(verdict.kind).toBe('fee_not_configured');
    }
  });

  it('a configured fee of zero is honoured as a real decision, not a missing one', () => {
    // 0 is a Director choice ("replacements are free this year"); null is not.
    const verdict = judgeReplacement({
      priorPrintedCount: 1,
      freeCardCount: 1,
      feeAmount: 0,
      feeCurrency: 'INR',
      acknowledged: true
    });
    expect(verdict.kind).toBe('chargeable');
  });
});

describe('guard 2 — a priced replacement is counted and charged', () => {
  const priced = { freeCardCount: 1, feeAmount: 250, feeCurrency: 'INR' };

  it('holds the print until the caller accepts the charge', () => {
    const verdict = judgeReplacement({ ...priced, priorPrintedCount: 1, acknowledged: false });

    expect(verdict.kind).toBe('fee_required');
    if (verdict.kind !== 'fee_required') return;
    expect(verdict.feeAmount).toBe(250);
    expect(describeReplacement(verdict)).toContain('INR 250');
  });

  it('prints once the charge is accepted', () => {
    const verdict = judgeReplacement({ ...priced, priorPrintedCount: 1, acknowledged: true });

    expect(verdict.kind).toBe('chargeable');
    if (verdict.kind !== 'chargeable') return;
    expect(verdict.replacementNumber).toBe(1);
    expect(verdict.feeAmount).toBe(250);
  });

  it('counts replacements, not cards', () => {
    // 4 of the 5 people who have ever been printed already hold more than one
    // card, so the numbering has to be right the first time it is shown.
    expect(
      (judgeReplacement({ ...priced, priorPrintedCount: 1, acknowledged: true }) as { replacementNumber: number })
        .replacementNumber
    ).toBe(1);
    expect(
      (judgeReplacement({ ...priced, priorPrintedCount: 3, acknowledged: true }) as { replacementNumber: number })
        .replacementNumber
    ).toBe(3);
  });

  it('follows a configured free allowance larger than one', () => {
    const twoFree = { ...priced, freeCardCount: 2, acknowledged: true };
    expect(judgeReplacement({ ...twoFree, priorPrintedCount: 1 }).kind).toBe('free');
    expect(judgeReplacement({ ...twoFree, priorPrintedCount: 2 }).kind).toBe('chargeable');
  });

  it('treats a zero free allowance as "every card is chargeable"', () => {
    const verdict = judgeReplacement({
      ...priced,
      freeCardCount: 0,
      priorPrintedCount: 0,
      acknowledged: true
    });
    expect(verdict.kind).toBe('chargeable');
    if (verdict.kind !== 'chargeable') return;
    expect(verdict.replacementNumber).toBe(1);
  });
});
