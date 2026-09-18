-- ============================================================================
-- 2026-09-18_backfill_learner_activation_from_induction.sql
--
-- ███  APPLY ONLY ON THE DIRECTOR'S NUMBER.  ███
--
-- THIS FILE IS NOT A MIGRATION AND IS NOT AUTO-APPLIED.
--   * It does not live in supabase/migrations/, so `supabase db push`, the ship
--     wave and the migration dispatcher never see it.
--   * It has no version stamp, so it can never acquire a schema_migrations row.
--   * It is run by hand, once, by a person who has been given a number.
--
-- WHAT IT IS FOR
--
--   20260918170000_learner_auto_activate_on_induction.sql is forward-only: its
--   trigger fires when outcome_complete BECOMES true. Learners who finished
--   induction BEFORE it ships are invisible to it forever. This is that backlog.
--
-- THE NUMBER, measured read-only on production 2026-09-18:
--
--     155 learners   (of 304 sitting at `admitted`)
--
--     JKKN College of Engineering and Technology .........  86
--     JKKN College of Pharmacy ...........................  53
--     JKKN College of Nursing and Research ...............  10
--     JKKN College of Allied Health Sciences .............   6
--     ------------------------------------------------------------
--     TOTAL ..............................................  155
--
--   The other 149 admitted learners have NO complete induction row and are not
--   touched. Neither are the 24 inactive / 12 rejected / 9 reserved / 3 account
--   learners who DO have one — see the spec's edge-case table.
--
--   THE NUMBER DRIFTS. Step 1 below reprints it as it stands at the moment of
--   running. If step 1 disagrees with 155 by more than a handful, STOP and ask
--   before running step 2.
--
-- SPEC: docs/features/2026-09-18-FEATURE-learner-auto-activation-on-induction.md
--
-- HOW TO RUN
--   1. Run STEP 1 alone. Read the counts aloud. Get the number.
--   2. Run STEP 2 inside its BEGIN. Read the receipt. COMMIT or ROLLBACK.
-- ============================================================================


-- ============================================================================
-- STEP 1 — READ-ONLY. Who WOULD be activated, counted by institution.
--          Safe to run against production at any time. Changes nothing.
-- ============================================================================

SELECT
  i.name                       AS institution,
  count(*)                     AS would_activate
FROM public.learners_profiles lp
JOIN public.institutions i ON i.id = lp.institution_id
WHERE lp.lifecycle_status::text = 'admitted'
  AND EXISTS (
    SELECT 1
    FROM public.induction_completion ic
    WHERE ic.learner_id = lp.id
      AND ic.outcome_complete IS TRUE
  )
GROUP BY i.name
ORDER BY count(*) DESC;

-- Grand total, and the two populations deliberately left alone, in one read.
SELECT
  count(*) FILTER (
    WHERE lp.lifecycle_status::text = 'admitted' AND ic.learner_id IS NOT NULL
  ) AS would_activate_total,
  count(*) FILTER (
    WHERE lp.lifecycle_status::text = 'admitted' AND ic.learner_id IS NULL
  ) AS admitted_but_induction_not_complete,
  count(*) FILTER (
    WHERE lp.lifecycle_status::text <> 'admitted' AND ic.learner_id IS NOT NULL
  ) AS induction_complete_but_not_admitted_untouched
FROM public.learners_profiles lp
LEFT JOIN LATERAL (
  SELECT ic.learner_id
  FROM public.induction_completion ic
  WHERE ic.learner_id = lp.id AND ic.outcome_complete IS TRUE
  LIMIT 1
) ic ON true;


-- ============================================================================
-- STEP 2 — THE WRITE. Runs inside an explicit transaction so a rehearsal
--          rolls back. Nothing below executes until the BEGIN is uncommented.
--
--          The same allowlist of one status as the trigger. The same audit
--          table. A DIFFERENT reason_code — `induction_completed_backfill` —
--          so a one-time sweep is distinguishable from a live activation
--          forever.
--
--          No DELETE, no TRUNCATE, no DROP. One UPDATE and one INSERT.
-- ============================================================================

-- BEGIN;
--
-- WITH eligible AS (
--   SELECT
--     lp.id                AS learner_id,
--     lp.institution_id,
--     ic.id                AS induction_completion_id,
--     ic.event_id,
--     ic.completed_at
--   FROM public.learners_profiles lp
--   JOIN LATERAL (
--     SELECT ic.id, ic.event_id, ic.completed_at
--     FROM public.induction_completion ic
--     WHERE ic.learner_id = lp.id
--       AND ic.outcome_complete IS TRUE
--     ORDER BY ic.completed_at NULLS LAST, ic.created_at
--     LIMIT 1
--   ) ic ON true
--   WHERE lp.lifecycle_status::text = 'admitted'
-- ),
-- promoted AS (
--   UPDATE public.learners_profiles lp
--      SET lifecycle_status = 'active'::lifecycle_status,
--          updated_at       = now()
--     FROM eligible e
--    WHERE lp.id = e.learner_id
--      -- Repeated inside the UPDATE on purpose: under READ COMMITTED the row
--      -- is re-checked after the lock, so a learner activated by the trigger
--      -- or by an admin between STEP 1 and STEP 2 is skipped, not double-written.
--      AND lp.lifecycle_status::text = 'admitted'
--   RETURNING lp.id AS learner_id, e.induction_completion_id, e.event_id,
--             e.institution_id, e.completed_at
-- )
-- INSERT INTO public.learners_profile_status_history
--   (learner_id, from_status, to_status, reason_code, changed_by, metadata)
-- SELECT
--   p.learner_id,
--   'admitted'::lifecycle_status,
--   'active'::lifecycle_status,
--   'induction_completed_backfill',
--   auth.uid(),
--   jsonb_build_object(
--     'source',                  'manual/2026-09-18_backfill_learner_activation_from_induction.sql',
--     'director_ruling',         '2026-09-18 14:30',
--     'from_status',             'admitted',
--     'induction_completion_id', p.induction_completion_id,
--     'event_id',                p.event_id,
--     'institution_id',          p.institution_id,
--     'completed_at',            p.completed_at,
--     'fee_thresholds_bypassed', true,
--     'backfill',                true)
-- FROM promoted p;
--
-- -- RECEIPT — read this before deciding. Expect 155 (see the header).
-- SELECT count(*) AS activated_by_this_backfill
-- FROM public.learners_profile_status_history
-- WHERE reason_code = 'induction_completed_backfill';
--
-- -- Then ONE of:
-- -- ROLLBACK;   -- rehearsal
-- -- COMMIT;     -- only on the Director's number
