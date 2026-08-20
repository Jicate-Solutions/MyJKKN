-- ============================================================================
-- Campus Living — repair two hostel_room_eligibility_rules whose semester_ids
-- point at semesters that no longer exist (2026-08-10)
-- ============================================================================
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
-- fn_learner_strictly_eligible_for_room matches a rule to a learner with:
--     (cardinality(c.semester_ids) = 0 OR v_semester = ANY(c.semester_ids))
-- A rule holding exactly ONE semester id therefore skips the "all semesters"
-- branch, and if that id no longer exists in `semesters` the ANY() is false for
-- every learner alive. The rule matches NOBODY — while still COVERING its rooms,
-- because coverage (v_has_covering) is computed independently of matching. The
-- result is a room reserved away from everyone and granted to no one.
--
-- Both ids below were verified globally orphaned before this migration:
--     * absent from `semesters`
--     * referenced by ZERO learners_profiles.semester_id
--     * present only inside these two rules' semester_ids arrays
-- Both rules were created 2026-08-05 06:20 / 06:26, minutes before sibling
-- rules whose semester ids DO resolve — i.e. they were valid when written and
-- were orphaned later by a semester purge. The original semester names are
-- therefore unrecoverable from the data, so the replacement scope below was
-- chosen by the operator, not inferred.
--
-- ── 1. ba8ebb33 — BSC (Nursing), Girls Hostel A, rooms 5, 6, 10, 11 ─────────
-- Dangling: 75145ec3-0f6f-44c5-8af1-01cdd66e1091
-- Set to '{}' => the "all semesters" branch, matching the sibling rule
-- 32a7b51f, which already grants all Nursing UG 18 other rooms in this block.
-- Rooms 5/6/10/11 are NOT in that sibling rule, so they are currently reachable
-- by no one; room 6 holds 3 free beds. This widens the rule to every Nursing UG
-- semester — a deliberate capacity change, not a like-for-like restore.
--
-- ── 2. 538c6ee3 — BDS, Girls Hostel B, block-wide (no rooms attached) ───────
-- Dangling: 0a1ed56a-73b6-484e-8c73-d489c788d7e6
-- Deactivated rather than widened: rule a5306848 (Dental, all UG, block-wide,
-- created 2026-07-24) already grants every Dental UG learner access to every
-- room in Girls Hostel B, so this rule can grant nothing new whatever semester
-- it names. No learner gains or loses a bed; a misleading dead row leaves the
-- Physical Rooms screen.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────────
-- Only these two rows. The seven BLOCK-WIDE girls rules (floor Any + no rooms,
-- which make every girls room "covered" and so keep the 2026-08-10 overflow
-- tier inert across all girls blocks) are deliberately NOT touched here — that
-- conversion is a separate, larger change requiring its own before/after review.
-- 97 live allocations in Girls Hostel A currently rest on that block-wide access
-- (Dental 61, Pharmacy 34, Arts & Science 2).

BEGIN;

DROP TABLE IF EXISTS public.bak_room_rule_dangling_sem_20260810;

CREATE TABLE public.bak_room_rule_dangling_sem_20260810 AS
SELECT re.id, re.block_id, re.institution_id, re.program_id,
       re.semester_ids, re.floor, re.is_active, now() AS captured_at
  FROM public.hostel_room_eligibility_rules re
 WHERE re.id IN ('ba8ebb33-c0a6-45f9-ba25-9e1e83090c69',
                 '538c6ee3-7a9a-4e8f-bff1-cc38937373d5');

DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.bak_room_rule_dangling_sem_20260810;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Expected 2 target rules in the snapshot, found %. Aborting.', v_n;
  END IF;

  -- Guard: both ids must still be orphaned. If a semester with either id has
  -- reappeared, the premise of this migration is gone and it must not run.
  SELECT count(*) INTO v_n FROM public.semesters
   WHERE id IN ('75145ec3-0f6f-44c5-8af1-01cdd66e1091',
                '0a1ed56a-73b6-484e-8c73-d489c788d7e6');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'A supposedly-dangling semester id now resolves (% found). Aborting.', v_n;
  END IF;

  -- ── Stage 1: Nursing rule → all semesters ────────────────────────────────
  UPDATE public.hostel_room_eligibility_rules
     SET semester_ids = '{}'::uuid[],
         updated_at   = now()
   WHERE id = 'ba8ebb33-c0a6-45f9-ba25-9e1e83090c69'
     AND cardinality(semester_ids) = 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Stage 1 updated % rows, expected 1. Aborting.', v_n;
  END IF;

  -- ── Stage 2: redundant BDS block-wide rule → inactive ────────────────────
  UPDATE public.hostel_room_eligibility_rules
     SET is_active  = false,
         updated_at = now()
   WHERE id = '538c6ee3-7a9a-4e8f-bff1-cc38937373d5'
     AND is_active;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Stage 2 updated % rows, expected 1. Aborting.', v_n;
  END IF;

  -- ── Post-check: no ACTIVE girls rule may still carry a dangling id ───────
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
    JOIN public.hostel_blocks hb ON hb.id = re.block_id
   WHERE re.is_active
     AND hb.hostel_type::text = 'girls'
     AND cardinality(re.semester_ids) > 0
     AND NOT EXISTS (SELECT 1 FROM unnest(re.semester_ids) sid
                     JOIN public.semesters s ON s.id = sid);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Still % active girls rule(s) matching nobody via dangling semesters. Aborting.', v_n;
  END IF;

  -- Girls Hostel B must keep exactly one live block-wide rule (a5306848), or
  -- deactivating 538c6ee3 has silently removed Dental's access to the block.
  SELECT count(*) INTO v_n
    FROM public.hostel_room_eligibility_rules re
    JOIN public.hostel_blocks hb ON hb.id = re.block_id
   WHERE re.is_active AND hb.name = 'Girls Hostel B'
     AND re.floor IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.hostel_room_eligibility_rule_rooms rr
                     WHERE rr.rule_id = re.id);
  IF v_n < 1 THEN
    RAISE EXCEPTION 'Girls Hostel B has no live block-wide rule left — Dental access lost. Aborting.';
  END IF;

  RAISE NOTICE 'OK: Nursing rule widened to all semesters, redundant BDS rule deactivated.';
END $$;

COMMIT;

-- Rollback (manual, if ever needed):
--   UPDATE hostel_room_eligibility_rules r
--      SET semester_ids = b.semester_ids, is_active = b.is_active
--     FROM bak_room_rule_dangling_sem_20260810 b
--    WHERE r.id = b.id;
