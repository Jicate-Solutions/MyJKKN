-- ============================================================================
-- One-off: re-evaluate every learner stranded by the auto-promotion bug
-- ============================================================================
-- 20260811140000 fixed the trigger plumbing, but a trigger only fires on the
-- NEXT payment. Learners whose qualifying payment already landed — during the
-- months RC1/RC2 were swallowing it — would sit in the wrong status forever,
-- because nothing in this system ever revisits a learner (there is no sweep and
-- no manual re-run; evaluate_learner_status_after_payment is reachable only
-- from the payment triggers and from two TypeScript call sites that merely
-- VALIDATE a manual status change).
--
-- Measured immediately before this ran (2026-08-11):
--     account   83 learners ->  16 satisfy the Stage A gate
--     reserved 870 learners ->  84 already clear the 30% admitted threshold
--                               (788 are legitimately below it — not stuck)
-- Expected effect: 100 promotions. Nothing else moves.
--
-- SAFE TO RE-RUN. evaluate_learner_status_after_payment only ever promotes: it
-- returns 'no_op_for_status' for anything outside ('account','reserved'), and
-- each UPDATE re-asserts the from-status in its WHERE clause. There is no path
-- through it that demotes a learner or writes a spurious history row.
--
-- PREREQUISITE: 20260811150000_sync_learner_status_mirror_induction_allowlist
-- MUST have run first. Every promotion here fires sync_learner_status_to_profile,
-- and under the old allow-list that would have set profiles.is_active = false
-- for 62 of these learners — locking them out of My Induction via proxy.ts:492.
-- ============================================================================

DO $$
DECLARE
  r              record;
  v_result       jsonb;
  v_seen         integer := 0;
  v_to_reserved  integer := 0;
  v_to_admitted  integer := 0;
BEGIN
  FOR r IN
    SELECT lp.id
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status::text IN ('account', 'reserved')
    ORDER BY lp.id
  LOOP
    v_result := public.evaluate_learner_status_after_payment(r.id);
    v_seen := v_seen + 1;

    IF (v_result ->> 'promoted_to_universal')::boolean THEN
      v_to_reserved := v_to_reserved + 1;
    END IF;
    IF (v_result ->> 'promoted_to_threshold')::boolean THEN
      v_to_admitted := v_to_admitted + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete: % learners evaluated, % -> reserved, % -> admitted',
    v_seen, v_to_reserved, v_to_admitted;
END $$;
