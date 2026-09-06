-- ============================================================================
-- Campus Living — finish the gender split-brain fix: the allocation VALIDATION
-- TRIGGER and the two readiness functions still read the login shadow (2026-08-10)
-- ============================================================================
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- Generate failed with 23514:
--     Cannot allocate learner ARISHVA K.S (107ffde0-…) — gender is not set on profile
--
-- 20260810190000 taught fn_auto_allocate_candidates and fn_auto_allocate_classic
-- to resolve gender as
--     lower(btrim(COALESCE(NULLIF(btrim(profiles.gender),''), lp.gender)))
-- so a learner whose login shadow row has a blank gender is still placed from
-- the learners_profiles master record. That fix was INCOMPLETE: it changed the
-- two functions that CHOOSE a bed, but not the BEFORE INSERT trigger that
-- VALIDATES the row. The engine therefore selected ARISHVA correctly and
-- fn_validate_hostel_allocation_gender rejected the INSERT, aborting the whole
-- batch — a strictly worse outcome than before, because the preview now
-- promises a placement the write refuses.
--
-- ── ROOT CAUSE OF THE MISS ──────────────────────────────────────────────────
-- The earlier sweep searched for the ALLOCATION function names and for
-- gender_ok/physical_rule_ok. It did not sweep pg_proc BY BODY for every reader
-- of profiles.gender. Off-axis objects — a trigger on the target table, and
-- read-only readiness reporters — were invisible to that search. Same lesson as
-- the hr_leave_balances column rename: when a column's meaning changes, grep
-- pg_proc.prosrc, not the call graph.
--
-- The full sweep found exactly four shadow-only readers; three are fixed here:
--   1. fn_validate_hostel_allocation_gender  — BLOCKS the insert (this bug)
--   2. fn_hostel_unallocated_candidates      — emits the literal user-facing
--      string 'Gender not set' on the Allocations → Not Allocated tab, which is
--      the second symptom originally reported alongside the room-rule message
--   3. fn_auto_allocate_preview              — the aggregate cards; its gender
--      test is permissive so it never blocked, but it must not drift
-- fn_get_curfew was a false positive: its `p` is hostel_curfew_policies, not
-- profiles, and its p.gender is policy scope ('both'/'male'/'female').
--
-- NOTE ON IDENTITY: hostel_allocations.learner_id is a PROFILES id, not a
-- learners_profiles id — the two id spaces are disjoint. The trigger therefore
-- reaches the master record via profiles.learner_id, not by equating the ids.
--
-- profiles.gender is deliberately NOT backfilled: writing it fires
-- trigger_sync_user_update_webhook → POST https://auth.jkkn.ai/api/auth/sync-user.

BEGIN;

-- ── 1. The blocker: allocation gender validation ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_hostel_allocation_gender()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_block_type hostel_type_enum;
    v_learner_gender text;
    v_learner_name text;
    v_block_name text;
BEGIN
    SELECT b.hostel_type, b.name
      INTO v_block_type, v_block_name
      FROM hostel_blocks b WHERE b.id = NEW.block_id;

    -- Byte-identical resolution to fn_auto_allocate_candidates /
    -- fn_auto_allocate_classic: login shadow first, learners_profiles master
    -- fills a blank. These MUST agree — if the engine places from one column and
    -- this trigger validates from another, a learner the preview shows as "In"
    -- aborts the entire batch on INSERT.
    -- NEW.learner_id is a profiles.id, so the master record is reached via
    -- profiles.learner_id (the two id spaces are disjoint).
    SELECT lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))),
           COALESCE(p.full_name, p.email, NEW.learner_id::text)
      INTO v_learner_gender, v_learner_name
      FROM profiles p
      LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
     WHERE p.id = NEW.learner_id;

    -- Gender must be resolvable from EITHER record.
    IF v_learner_gender IS NULL OR v_learner_gender = '' THEN
        RAISE EXCEPTION 'Cannot allocate learner % (%) — gender is not set on either the login profile or the learner record',
            v_learner_name, NEW.learner_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_block_type = 'boys' AND v_learner_gender NOT IN ('male','m') THEN
        RAISE EXCEPTION 'Cannot allocate % (gender=%) to boys-only block %',
            v_learner_name, v_learner_gender, v_block_name
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_block_type = 'girls' AND v_learner_gender NOT IN ('female','f') THEN
        RAISE EXCEPTION 'Cannot allocate % (gender=%) to girls-only block %',
            v_learner_name, v_learner_gender, v_block_name
            USING ERRCODE = 'check_violation';
    END IF;

    -- mixed, staff, international, married, working_women, medical: no gender check
    RETURN NEW;
END;
$function$;

-- ── 2. Not Allocated tab: the false "Gender not set" ────────────────────────
-- p_institution_id keeps its DEFAULT NULL: CREATE OR REPLACE cannot remove an
-- existing parameter default (42P13), and callers rely on the no-arg form.
CREATE OR REPLACE FUNCTION public.fn_hostel_unallocated_candidates(p_institution_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(learner_id uuid, first_name text, last_name text, full_name text, email text,
  gender text, institution_id uuid, institution_name text, program_name text, semester_name text,
  academic_year_id uuid, academic_year_name text, has_profile boolean, gender_set boolean,
  academic_year_set boolean, room_category_resolved boolean, mess_category_resolved boolean,
  resolved_room_category_name text, resolved_mess_category_name text, bill_state text,
  readiness text, missing_items text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
      lp.gender AS lp_gender,   -- master record, for the resolution below
      lp.institution_id,
      lp.program_id,
      lp.semester_id,
      lp.academic_year_id,
      room_elig.cats AS room_cats,
      mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) room_elig ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_mess_categories(lp.id)
    ) mess_elig ON true
    WHERE lp.accommodation_type_id IN (
            SELECT id FROM accommodation_types WHERE code = 'hostel'
          )
      AND lp.lifecycle_status = 'active'
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND NOT EXISTS (
        SELECT 1
        FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  enriched AS (
    SELECT
      c.id                                                          AS learner_id,
      c.first_name,
      c.last_name,
      COALESCE(
        p.full_name,
        NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        p.email
      )                                                             AS full_name,
      p.email,
      -- Same resolution as the allocation engine: shadow first, master fills a
      -- blank. Previously read profiles.gender alone, so a learner with a blank
      -- shadow was reported "Gender not set" on the Not Allocated tab even
      -- though learners_profiles held a perfectly good value.
      lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), c.lp_gender)))  AS gender,
      c.institution_id,
      inst.name                                                     AS institution_name,
      prog.program_name,
      sem.semester_name,
      c.academic_year_id,
      ay.academic_year_name,
      (p.id IS NOT NULL)                                            AS has_profile,
      (COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(c.lp_gender), '')) IS NOT NULL) AS gender_set,
      (c.academic_year_id IS NOT NULL)                              AS academic_year_set,
      (c.room_cats IS NOT NULL)                                     AS room_category_resolved,
      (c.mess_cats IS NOT NULL)                                     AS mess_category_resolved,
      rc.name                                                       AS resolved_room_category_name,
      mc.name                                                       AS resolved_mess_category_name,
      CASE
        WHEN c.academic_year_id IS NULL THEN 'none'
        WHEN (
          SELECT count(*) FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id = c.academic_year_id
        ) > 0 THEN 'matched'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id IS NOT NULL
            AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ) THEN 'different_year'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
        ) THEN 'untagged'
        ELSE 'none'
      END                                                           AS bill_state,
      c.room_cats,
      c.mess_cats
    FROM candidates c
    LEFT JOIN profiles       p    ON p.learner_id   = c.id
    LEFT JOIN institutions   inst ON inst.id         = c.institution_id
    LEFT JOIN programs       prog ON prog.id         = c.program_id
    LEFT JOIN semesters      sem  ON sem.id          = c.semester_id
    LEFT JOIN academic_years ay   ON ay.id           = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id          = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id          = c.mess_cats[1]
  )
  SELECT
    e.learner_id,
    e.first_name,
    e.last_name,
    e.full_name,
    e.email,
    e.gender,
    e.institution_id,
    e.institution_name,
    e.program_name,
    e.semester_name,
    e.academic_year_id,
    e.academic_year_name,
    e.has_profile,
    e.gender_set,
    e.academic_year_set,
    e.room_category_resolved,
    e.mess_category_resolved,
    e.resolved_room_category_name,
    e.resolved_mess_category_name,
    e.bill_state,
    CASE
      WHEN e.has_profile
        AND e.gender_set
        AND e.academic_year_set
        AND e.room_category_resolved
        AND e.bill_state = 'matched'
      THEN 'ready'
      ELSE 'incomplete'
    END                                                             AS readiness,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN NOT e.has_profile             THEN 'No login profile'                         END,
      CASE WHEN NOT e.gender_set              THEN 'Gender not set'                           END,
      CASE WHEN NOT e.academic_year_set       THEN 'Academic year not set'                    END,
      CASE WHEN NOT e.room_category_resolved  THEN 'No room-category eligibility rule'        END,
      CASE WHEN e.bill_state = 'none'         THEN 'No academic bill generated'               END,
      CASE WHEN e.bill_state = 'different_year' THEN 'Bill tagged to a different academic year' END,
      CASE WHEN e.bill_state = 'untagged'     THEN 'Academic bill not year-tagged'            END
    ], NULL)                                                        AS missing_items
  FROM enriched e
  ORDER BY
    (CASE
       WHEN e.has_profile AND e.gender_set AND e.academic_year_set
            AND e.room_category_resolved AND e.bill_state = 'matched'
       THEN 0 ELSE 1
     END),
    e.full_name;
$function$;

-- ── 3. Aggregate preview cards ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(
  p_hostel_type text,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer,
  available_beds integer, rules_set boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blocks AS (
    SELECT id FROM hostel_blocks WHERE hostel_type::text = p_hostel_type
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (
            SELECT bi.institution_id FROM hostel_block_institutions bi
            WHERE bi.block_id IN (SELECT id FROM blocks))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      -- Same resolution as the candidate RPC. Previously read gp.gender alone,
      -- so a blank shadow fell into the permissive "unknown" branch and the
      -- learner was counted in BOTH the boys and the girls aggregate.
      AND (COALESCE(NULLIF(btrim(gp.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('female','f')))
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id IN (SELECT id FROM blocks) AND r.room_purpose='student' AND b.status='available'
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id IN (SELECT id FROM blocks) AND is_active);
$function$;

-- CREATE OR REPLACE keeps existing grants (no signature change), so none are
-- re-issued here. The trigger fn is not directly executable by clients.

COMMIT;
