-- Campus Living — 21 vacated hostel learners reverted to Day Scholar (2026-07-29)
--
-- These learners have left the hostel at semester end. Reverting the
-- accommodation flag ALONE is not enough: 10 of them still hold an `active`
-- hostel_allocations row whose bed is still `occupied`, so the rooms would
-- never actually be released and they would keep showing on room rosters and
-- in the Allocations module.
--
-- KEYED ON college_email, NOT roll_number. Roll numbers are NOT unique in
-- learners_profiles — `PB23004` alone matches 74 rows, so a roll-number
-- predicate would have flipped 74 learners to day scholar instead of 1. Every
-- college email below matches exactly one row; roll_number is carried into the
-- backup for cross-checking only.
--
-- ORDER IS LOAD-BEARING. hostel_allocations has
-- trg_allocation_sync_learner_categories, which on ANY allocation UPDATE writes
-- hostel_category_id back onto the learner from the room. So the allocations
-- must be vacated BEFORE the categories are cleared, or vacating re-populates
-- them. Stage 1 -> 2 -> 3 must not be reordered.
--
-- Beds are freed explicitly: no trigger does it. See the comment on
-- HostelAllocationService.transfer() — "a plain row update left the old bed
-- stuck 'occupied' and the new bed bookable by someone else".
--
-- Bills are deliberately NOT touched (22 live bills across 6 of these
-- learners). Safe here because all 21 carry legacy_fee_mode = true, which makes
-- trg_detect_fee_dimension_change RETURN NEW on its first line — no fee
-- re-resolution and no admission_fee_change_events rows. On a NON-legacy
-- learner the same UPDATE would open a pending_review fee-change event.

BEGIN;

-- ── Rollback snapshot ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS public._bak_hostel_to_dayscholar_20260729;

CREATE TABLE public._bak_hostel_to_dayscholar_20260729 AS
SELECT
  lp.id                            AS learner_profile_id,
  btrim(lp.roll_number)            AS roll_number,
  btrim(coalesce(lp.first_name, '') || ' ' || coalesce(lp.last_name, '')) AS learner_name,
  lower(btrim(lp.college_email))   AS college_email,
  lp.accommodation_type_id         AS old_accommodation_type_id,
  lp.hostel_category_id            AS old_hostel_category_id,
  lp.mess_category_id              AS old_mess_category_id,
  a.id                             AS allocation_id,
  a.status::text                   AS old_allocation_status,
  a.vacate_reason::text            AS old_vacate_reason,
  a.actual_vacate_date             AS old_actual_vacate_date,
  a.check_out_date                 AS old_check_out_date,
  a.bed_id                         AS bed_id,
  bd.status::text                  AS old_bed_status,
  bd.current_occupant_id           AS old_bed_occupant_id,
  now()                            AS captured_at
FROM (VALUES
  ('charulathar.dp@jkkn.ac.in'),      -- PD23007 CHARULATHA R R
  ('arivuindhraa.dp@jkkn.ac.in'),     -- PD23003 ARIVU INDHRA R
  ('deepthika_k@jkkn.ac.in'),         -- PD22004 DEEPTHIKA K
  ('renia.m@jkkn.ac.in'),             -- PD21017 RENIA M
  ('sowmya_m@jkkn.ac.in'),            -- PD20026 SOWMYA M.L
  ('jerina.ca@jkkn.ac.in'),           -- PD20013 JERINA CA
  ('jemima.y@jkkn.ac.in'),            -- PD20012 JEMIMA Y
  ('evangelin.gabriel@jkkn.ac.in'),   -- PD20008 EVANGELIN GABRIEL R
  ('sivajip.bp@jkkn.ac.in'),          -- PB23004 SIVAJI P
  ('kiruthikam24nur@jkkn.ac.in'),     -- NB24028 KIRUTHIKA M
  ('periyanayagame.ns@jkkn.ac.in'),   -- NB23038 PERIYANAYAGAM E E
  ('krishnavenig.ns@jkkn.ac.in'),     -- NB23025 KRISHNAVENI G
  ('aneesanur22@jkkn.ac.in'),         -- NB220006 ANEES A
  ('sathyapriyakeee2025@jkkn.ac.in'), -- EE25044 SATHYAPRIYA K
  ('vasukiseee2025@jkkn.ac.in'),      -- EE25030 VASUKI S
  ('girijas24pa@jkkn.ac.in'),         -- 24PA03 GIRIJA S
  ('gangatharanik24mrs@jkkn.ac.in'),  -- 24MRS05 GANGA DHARANI K
  ('archanas.ahs@jkkn.ac.in'),        -- 23MRS01 ARCHANA S
  ('vidhyashreepapa22@jkkn.ac.in'),   -- 22PA09 VIDHYASHREE P
  ('swathimapa22@jkkn.ac.in'),        -- 22PA08 SWATHI M
  ('nivethasact22@jkkn.ac.in')        -- 22CT04 NIVETHA S
) AS t(email_c)
JOIN learners_profiles lp
  ON lower(btrim(lp.college_email)) = t.email_c
LEFT JOIN profiles p
  ON p.learner_id = lp.id
LEFT JOIN hostel_allocations a
  ON a.learner_id = p.id AND a.status = 'active'
LEFT JOIN hostel_beds bd
  ON bd.id = a.bed_id;

DO $$
DECLARE
  v_dayscholar uuid;
  v_targets    int;
  v_allocs     int;
  v_beds       int;
  v_n          int;
BEGIN
  SELECT count(*) INTO v_targets FROM public._bak_hostel_to_dayscholar_20260729;
  IF v_targets <> 21 THEN
    RAISE EXCEPTION 'Expected 21 target learners, found %. Aborting.', v_targets;
  END IF;

  SELECT count(*) INTO v_allocs
    FROM public._bak_hostel_to_dayscholar_20260729 WHERE allocation_id IS NOT NULL;
  IF v_allocs <> 10 THEN
    RAISE EXCEPTION 'Expected 10 active allocations, found %. Aborting.', v_allocs;
  END IF;

  SELECT count(*) INTO v_beds
    FROM public._bak_hostel_to_dayscholar_20260729 WHERE bed_id IS NOT NULL;
  IF v_beds <> 10 THEN
    RAISE EXCEPTION 'Expected 10 occupied beds, found %. Aborting.', v_beds;
  END IF;

  SELECT id INTO v_dayscholar FROM public.accommodation_types WHERE code = 'dayscholar';
  IF v_dayscholar IS NULL THEN
    RAISE EXCEPTION 'accommodation_types.code = dayscholar not found. Aborting.';
  END IF;

  -- ── Stage 1: vacate the allocations ──────────────────────────────────────
  -- check_out_date is required, not cosmetic: the bed-uniqueness constraint is
  -- UNIQUE (room_id, bed_id) WHERE check_out_date IS NULL, so leaving it NULL
  -- keeps the bed blocked against re-allocation even once status = 'vacated'.
  UPDATE public.hostel_allocations a
     SET status             = 'vacated',
         vacate_reason      = 'semester_end',
         actual_vacate_date = current_date,
         check_out_date     = current_date,
         updated_at         = now()
    FROM public._bak_hostel_to_dayscholar_20260729 b
   WHERE a.id = b.allocation_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'Stage 1 vacated % allocations, expected 10. Aborting.', v_n;
  END IF;

  -- ── Stage 2: free the beds ───────────────────────────────────────────────
  UPDATE public.hostel_beds bd
     SET status              = 'available',
         current_occupant_id = NULL,
         updated_at          = now()
    FROM public._bak_hostel_to_dayscholar_20260729 b
   WHERE bd.id = b.bed_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'Stage 2 freed % beds, expected 10. Aborting.', v_n;
  END IF;

  -- ── Stage 3: flip accommodation + clear hostel/mess categories ───────────
  -- MUST run after Stage 1 — see the trigger note in the file header.
  UPDATE public.learners_profiles lp
     SET accommodation_type_id = v_dayscholar,
         hostel_category_id    = NULL,
         mess_category_id      = NULL,
         updated_at            = now()
    FROM public._bak_hostel_to_dayscholar_20260729 b
   WHERE lp.id = b.learner_profile_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 21 THEN
    RAISE EXCEPTION 'Stage 3 updated % learners, expected 21. Aborting.', v_n;
  END IF;

  RAISE NOTICE 'OK: 21 learners -> dayscholar, 10 allocations vacated, 10 beds freed.';
END $$;

COMMIT;

-- Rollback (manual, if ever needed):
--   UPDATE learners_profiles lp SET accommodation_type_id = b.old_accommodation_type_id,
--          hostel_category_id = b.old_hostel_category_id, mess_category_id = b.old_mess_category_id
--     FROM _bak_hostel_to_dayscholar_20260729 b WHERE lp.id = b.learner_profile_id;
--   UPDATE hostel_allocations a SET status = b.old_allocation_status::allocation_status_enum,
--          vacate_reason = b.old_vacate_reason::vacate_reason_enum,
--          actual_vacate_date = b.old_actual_vacate_date, check_out_date = b.old_check_out_date
--     FROM _bak_hostel_to_dayscholar_20260729 b WHERE a.id = b.allocation_id;
--   UPDATE hostel_beds bd SET status = b.old_bed_status::bed_status_enum,
--          current_occupant_id = b.old_bed_occupant_id
--     FROM _bak_hostel_to_dayscholar_20260729 b WHERE bd.id = b.bed_id;
