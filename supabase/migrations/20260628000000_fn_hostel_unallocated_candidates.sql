-- fn_hostel_unallocated_candidates: Returns all active hostelites who do NOT
-- yet have an active or pending-approval bed allocation, together with
-- block-independent readiness checks so the admin can see exactly WHY a
-- student is not placed and what data must be fixed before auto-allocation
-- (or manual allocation) can succeed.
--
-- Block-specific conditions (physical room eligibility, free bed availability)
-- are NOT checked here — those require a target block and live in
-- fn_auto_allocate_candidates. This function answers the prior question:
-- "who is waiting for a bed, are they ready to be placed, and if not, why?"
--
-- readiness = 'ready' means ALL of the following pass:
--   ✓ has a login profile                 (has_profile)
--   ✓ gender is recorded                  (gender_set)
--   ✓ academic year set on learner record  (academic_year_set)
--   ✓ a room-category eligibility rule resolves for this student (room_category_resolved)
--   ✓ academic bill exists and is tagged to the current academic year (bill_state='matched')
--
-- mess_category_resolved is informational; a missing mess category does not
-- block placement (the admin can choose one manually).
CREATE OR REPLACE FUNCTION public.fn_hostel_unallocated_candidates(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE(
  learner_id                  uuid,
  first_name                  text,
  last_name                   text,
  full_name                   text,
  email                       text,
  gender                      text,
  institution_id              uuid,
  institution_name            text,
  program_name                text,
  semester_name               text,
  academic_year_id            uuid,
  academic_year_name          text,
  has_profile                 boolean,
  gender_set                  boolean,
  academic_year_set           boolean,
  room_category_resolved      boolean,
  mess_category_resolved      boolean,
  resolved_room_category_name text,
  resolved_mess_category_name text,
  bill_state                  text,
  readiness                   text,
  missing_items               text[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
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
      lower(trim(p.gender))                                         AS gender,
      c.institution_id,
      inst.name                                                     AS institution_name,
      prog.program_name,
      sem.semester_name,
      c.academic_year_id,
      ay.academic_year_name,
      (p.id IS NOT NULL)                                            AS has_profile,
      (p.gender IS NOT NULL AND btrim(p.gender) != '')             AS gender_set,
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
      CASE WHEN NOT e.has_profile             THEN 'No login profile'                           END,
      CASE WHEN NOT e.gender_set              THEN 'Gender not set'                             END,
      CASE WHEN NOT e.academic_year_set       THEN 'Academic year not set'                      END,
      CASE WHEN NOT e.room_category_resolved  THEN 'No room-category eligibility rule'          END,
      CASE WHEN e.bill_state = 'none'         THEN 'No academic bill generated'                 END,
      CASE WHEN e.bill_state = 'different_year' THEN 'Bill tagged to a different academic year' END,
      CASE WHEN e.bill_state = 'untagged'     THEN 'Academic bill not year-tagged'              END
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
