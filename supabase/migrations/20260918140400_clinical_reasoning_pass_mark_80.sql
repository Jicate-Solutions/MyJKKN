-- ============================================================================
-- Migration: 20260918140400_clinical_reasoning_pass_mark_80
-- Raise the clinical-reasoning pass mark from 60% to 80% (Director, 2026-09-18)
-- ============================================================================
-- WHAT CHANGES
--   platform_policies row 'clinical_reasoning.scoring.passing_threshold_pct'
--   (global scope) moves from 60 to 80. That number decides two things and
--   only those two:
--     1. pde_submissions.passed for a clinical case, and
--     2. whether pde_learner_capabilities.status flips to 'demonstrated'.
--   Both are read at scoring time in app/api/pde/clinical-reasoning/score,
--   whose own hard-coded fallback moves to 80 in the same change so the code
--   and the policy row cannot disagree when the RPC is unreachable.
--
-- WHAT DOES NOT CHANGE
--   • clinical_reasoning.lifetime_attempts_per_case stays at 5.
--   • clinical_reasoning.evidence_threshold_pct stays at 60 — accreditation
--     evidence is a separate judgement from passing, and the seed already
--     says so in that row's own cascade text.
--   • Scoring stays whole-case (earned/total across the rubric), NOT
--     per-question. Nothing here touches how the score is computed.
--
-- WHY IT IS SAFE TO RUN ONCE, AND ONLY ONCE
--   The 2026-05-22 seed is DELETE-then-INSERT over the whole
--   'clinical_reasoning.%' namespace, so re-running THAT file would reset this
--   value. This file must therefore be an UPDATE of the live row, never an
--   insert: an insert would violate uq_platform_policies_key_scope, and a
--   second seeded row would make fn_get_policy_clinical_reasoning's LIMIT 1
--   non-deterministic.
--
-- WHY AN ADMIN'S OWN NUMBER SURVIVES
--   Every save from /pde/admin/policies/clinical-reasoning writes updated_by
--   alongside value (TypedWidgetPolicyEditor -> use-clinical-reasoning-policies:
--   "every save records updated_by + updated_at for audit survival"). A row
--   still carrying updated_by IS NULL has never been touched by a person, so
--   its 60 is the seeded default and is ours to move. A row someone has
--   deliberately saved is theirs, and this migration leaves it alone — the
--   same "amend, never clobber" posture as
--   2026052811000_hostel_fees_policy_harmonization.sql, which supersedes by
--   amending the row it found rather than overwriting decisions.
--
--   Consequence, stated plainly: on an installation where an admin has already
--   saved this policy, the pass mark does NOT become 80 and the NOTICE below
--   says so by name. That is deliberate — a person's explicit decision outranks
--   a default — but it means the Director's 80 has to be set on that screen.
--   Silence would hide it, so this file refuses to be silent.
--
-- CONSEQUENCE TO EXPECT (this is why the faculty alert ships alongside)
--   A higher bar with an unchanged cap of 5 means MORE learners exhaust their
--   attempts. The cascade text on the row is extended to say so, and the
--   stuck-learner notice added in this same change is what stops that ending
--   in silence.
--
-- No function is created or replaced here, so there is no SECURITY DEFINER
-- grant surface to re-assert.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The value itself — untouched-default rows only.
-- ----------------------------------------------------------------------------
UPDATE platform_policies
   SET value = '80'::jsonb,
       updated_at = now()
 WHERE policy_key = 'clinical_reasoning.scoring.passing_threshold_pct'
   AND scope_type = 'global'
   AND scope_id IS NULL
   AND value = '60'::jsonb
   AND updated_by IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Tell the Director's own screen what the new number costs.
--
-- ui_cascade is the effect list rendered as chips under the widget. The link
-- between "higher bar" and "more learners hit the attempt cap" is the whole
-- reason the stuck-learner notice exists; a Director lowering or raising this
-- number later should see it on the same screen. Appended only when it is not
-- already present, so a re-run adds nothing.
--
-- Applied to the row regardless of who last saved it: this is a description of
-- how the system behaves, not a decision about what the number should be.
-- ----------------------------------------------------------------------------
UPDATE platform_policies
   SET ui_cascade = COALESCE(ui_cascade, '[]'::jsonb) || jsonb_build_array(
         jsonb_build_object(
           'effect',
           'Raising the bar without raising the attempt cap means more learners '
           || 'exhaust their attempts. Each one now notifies their Senior Learner '
           || 'automatically, who can grant more attempts.',
           'severity', 'medium'
         )
       ),
       updated_at = now()
 WHERE policy_key = 'clinical_reasoning.scoring.passing_threshold_pct'
   AND scope_type = 'global'
   AND scope_id IS NULL
   AND NOT (COALESCE(ui_cascade, '[]'::jsonb) @> '[{"effect":"Raising the bar without raising the attempt cap means more learners exhaust their attempts. Each one now notifies their Senior Learner automatically, who can grant more attempts."}]'::jsonb);

-- ----------------------------------------------------------------------------
-- 3. Say out loud what happened. A migration that leaves the pass mark at 60
--    because a person had set it must not look identical to one that moved it.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_value      jsonb;
  v_updated_by uuid;
BEGIN
  SELECT value, updated_by
    INTO v_value, v_updated_by
    FROM platform_policies
   WHERE policy_key = 'clinical_reasoning.scoring.passing_threshold_pct'
     AND scope_type = 'global'
     AND scope_id IS NULL
   LIMIT 1;

  IF v_value IS NULL THEN
    RAISE WARNING 'clinical_reasoning.scoring.passing_threshold_pct: no global row found. The seed 20260522_clinical_reasoning_policies_seed.sql has not run here; pass mark falls back to the code default (80).';
  ELSIF v_value = '80'::jsonb THEN
    RAISE NOTICE 'clinical_reasoning.scoring.passing_threshold_pct = 80. Pass mark raised (or already at 80).';
  ELSE
    RAISE WARNING 'clinical_reasoning.scoring.passing_threshold_pct LEFT AT % — an administrator had saved this policy (updated_by=%), so their number was preserved. Set 80 on /pde/admin/policies/clinical-reasoning if the Director''s decision should apply here.', (v_value #>> '{}'), v_updated_by;
  END IF;
END $$;

COMMIT;
