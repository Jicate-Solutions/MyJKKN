-- Adoption loop — count learner profiles where they are really created, and aim the
-- feature at the people who create them (Director ruling 9, 2026-09-24: the desk
-- wires what is not recorded and corrects intended roles, as a Draft PR).
--
-- Evidence, read from production on 2026-09-25 (profiles created in the last 90 days,
-- by the creator's role): admission 426, admission_staff 125, staff_counselor 99,
-- super_admin 17, hod 1, coo 1. The browser beacon this key relied on
-- (usage_event_module 'learners') has seen 6 people EVER. A W12 review of #4020 found
-- that the daily run would have asked the heaviest real users why they never create
-- profiles; #4020 excludes the key until this lands.
--
-- The code in this PR records learners.create_profile directly, on the signed-in
-- client, after a successful creation, at all four creation paths:
--   admission lead → learner (bridge/convert), bulk upload (once per upload that
--   inserted a profile), enquiry import (once per import), and the single form.
-- So this key now counts "did it", and the beacon link is cut.
--
-- intended_roles: admission, admission_staff, staff_counselor. HOD is dropped: one
-- profile in 90 days, and counting every HOD made the feature read dead.
-- cadence and usage_wired are left as they are (weekly, true).
--
-- GUARD: touches only this key, at most one row, and refuses unless the end state is
-- exactly as written. Re-running is safe: it matches the row it already wrote.

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.feature_registry
     SET intended_roles      = ARRAY['admission', 'admission_staff', 'staff_counselor']::text[],
         usage_event_module  = NULL,
         usage_event_feature = NULL,
         usage_event_type    = NULL,
         updated_at          = now()
   WHERE feature_key = 'learners.create_profile';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'adoption guard: update touched % rows, expected at most 1', v_rows;
  END IF;

  IF (SELECT count(*) FROM public.feature_registry
       WHERE feature_key = 'learners.create_profile'
         AND intended_roles = ARRAY['admission', 'admission_staff', 'staff_counselor']::text[]
         AND usage_event_module IS NULL
         AND usage_wired) <> 1 THEN
    RAISE EXCEPTION 'adoption guard: learners.create_profile is not labelled as written';
  END IF;

  RAISE NOTICE 'adoption: % registry row(s) updated', v_rows;
END $$;
