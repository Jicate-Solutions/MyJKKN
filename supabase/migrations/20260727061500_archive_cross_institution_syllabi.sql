-- Archive 4 BoS syllabi carrying a CROSS-INSTITUTION regulation pointer.
--
-- APPLIED TO PROD 2026-07-27 on explicit Director go. This file is the repo
-- RECORD of that repair (house rule: an applied data repair is re-issued as a
-- dated migration + SQL_FILE_INDEX entry). It is written IDEMPOTENT: re-running
-- it — or running it on a rebuilt database where the rows were never in the
-- broken state — is a no-op that RAISEs a NOTICE instead of failing.
--
-- THE DEFECT: a syllabus whose institutions_id differs from its regulation's
-- institution_id, sitting next to an institution-consistent sibling with the
-- same course_code. Both rows read is_latest = true, so every consumer that
-- filters on is_latest (e.g. lib/services/pde-bos-evidence-service.ts, which
-- feeds accreditation evidence) saw the course twice.
--
-- NOT a duplicate-regulation problem. regulations faa44348 (R-2024 of JKKN
-- College of Arts and Science (Self), b0b8a724) and 4dc273c5 (R-2024 of JKKN
-- College of Arts and Science (Aided), a33138b6) are legitimate per-institution
-- rows of the multi-tenant design. Merging them was considered and REJECTED:
-- both carry live per-college data (531 vs 327 syllabi, 77/79 POs, 74/75 PSOs,
-- 728/0 learner profiles). The keep-rule is institution-consistency, NOT "keep
-- the faa44348 side" — for 24UGEN03 the polarity is reversed.
--
-- SAFETY ESTABLISHED BEFORE APPLYING: only two columns in the database
-- reference bos_course_syllabi(id) — pde_demonstrations.bos_syllabus_id (0 refs
-- to any of these rows) and the self-FK revised_from_syllabus_id (1 child on
-- f5ec6a6c; archiving a parent only flips flags, the child's pointer survives).
-- Nothing is deleted; is_archived rows remain fully readable.
--
-- DELIBERATELY NOT INCLUDED — 24UBAC12 (a7615434, mis-pointed at Aided R-2024):
-- held back by Director decision because its content was edited AFTER its
-- keeper (e5c6e592) and carries richer textbook citations. A human compares the
-- two copies first. See .claude/bos-24ubac12-compare-2026-07-27.md.
--
-- Evidence: .claude/bos-double-latest-finding-2026-07-26.md (adversarially
-- verified). Remaining collisions after this repair are course_id import
-- collisions, a different defect family — see that finding's OPEN QUESTIONS.

-- Updated: 2026-07-27 - archive cross-institution-pointer syllabi (4 rows)
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    'aa915688-aab9-4311-a8af-8078ad7b2ea2',  -- 24UCCSP01, keeper d82239c3
    '59858d6c-e7f6-463b-b32a-90f97b6f6cde',  -- 24UCYC08,  keeper 38076b74
    '7b69351d-a844-4f08-b730-ef96ee51558f',  -- 24UGEN03,  keeper 054ecc92 (reversed polarity)
    'f5ec6a6c-1530-44e2-8621-d82346f379f1'   -- 24UVCC02,  keeper 3274feb6 (1 revision child, FK-safe)
  ]::uuid[];
  v_keepers uuid[] := ARRAY[
    'd82239c3-f9b0-487f-adb2-43d8e20d59be',
    '38076b74-ae19-4777-aa8b-19160ddb4776',
    '054ecc92-2b17-4b4a-8895-22f5c1d5b364',
    '3274feb6-2c6f-4d17-a6a8-2213fe6926a5'
  ]::uuid[];
  n integer;
  k integer;
BEGIN
  -- Only ever touches rows still in the broken state, and only these exact ids.
  UPDATE public.bos_course_syllabi
     SET is_latest = false, is_archived = true, last_modified_at = now()
   WHERE id = ANY(v_ids)
     AND is_latest
     AND NOT is_archived;
  GET DIAGNOSTICS n = ROW_COUNT;

  SELECT count(*) INTO k
    FROM public.bos_course_syllabi
   WHERE id = ANY(v_keepers) AND is_latest AND NOT is_archived;

  IF n = 0 THEN
    RAISE NOTICE 'archive_cross_institution_syllabi: 0 rows changed — already applied (prod 2026-07-27) or never in the broken state. No-op.';
  ELSE
    RAISE NOTICE 'archive_cross_institution_syllabi: archived % of 4 mis-pointed row(s).', n;
  END IF;

  -- The repair is only meaningful if each archived row still has its
  -- institution-consistent sibling serving as the live syllabus.
  IF k <> 4 THEN
    RAISE EXCEPTION 'keeper check failed: expected 4 live keepers, found % — refusing to leave courses with no latest syllabus', k;
  END IF;
  RAISE NOTICE 'archive_cross_institution_syllabi: keeper check OK (4/4 still latest).';
END $$;
