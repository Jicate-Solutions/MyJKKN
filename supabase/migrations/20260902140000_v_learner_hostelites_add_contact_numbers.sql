-- ============================================================================
-- Contact numbers on the hostelites roster: student, father, mother.
-- ============================================================================
-- Campus Living -> Residents -> Learners exports a 28-column spreadsheet and a
-- 12-column PDF roster. Both carried father_name and mother_name but NO phone
-- number for anyone, so a warden holding the printed roster could not call the
-- learner or either parent.
--
-- learners_profiles already stores all three and they are fully populated for
-- the 754 current hostel residents (student_mobile 754/754, father_mobile
-- 754/754, mother_mobile 754/754 as of 2026-09-02; 6 rows hold '' rather than
-- NULL, normalised to blank in the export layer rather than here, so the stored
-- value is left untouched). v_learner_hostelites simply never projected them.
--
-- TWO VIEWS MUST MOVE TOGETHER, and this is the trap in this migration.
-- v_learner_hostelites_scoped is declared as `SELECT v.* FROM
-- v_learner_hostelites v`, but Postgres EXPANDS that star into an explicit
-- column list at creation time and never re-expands it on its own. It is frozen
-- at the 42 columns that existed when 20260624104223 created it. The Residents
-- list reads the SCOPED view (LearnerHosteliteService.listHostelites, which
-- must, because the base view bypasses RLS), so extending only the base view
-- would have shipped three permanently blank columns with no error anywhere --
-- exactly the silent-failure shape this module keeps producing. Re-running the
-- scoped view's CREATE OR REPLACE re-expands the star to 45.
--
-- Both statements are CREATE OR REPLACE with the new columns APPENDED LAST, so
-- every pre-existing column keeps its name, type and ordinal position -- the
-- only shape change a replace permits, and the same convention the previous
-- extensions of this view followed.
--
-- SECURITY POSTURE IS DELIBERATELY UNCHANGED:
--   * the base view stays security_invoker = false. It bypasses RLS by design;
--     server-side consumers (detail drawer, allocation eligibility) read the
--     unscoped projection and expect every row.
--   * the scoped view keeps WITH (security_barrier = true) and the auth.uid()
--     derived predicate from 20260624104223_scope_learner_hostelites_view_idor_fix
--     verbatim -- super admin sees all, a block-scoped warden sees only their
--     granted blocks, everyone else is limited to accessible institutions.
--
-- This widens WHAT the roster projects, not WHO may read it. Worth stating
-- plainly though: these are PII, and the base view is granted to `authenticated`
-- while bypassing RLS, so any future client-side read of the BASE view would
-- expose every learner's contact numbers cross-tenant. New client paths must
-- keep going through v_learner_hostelites_scoped.
-- ============================================================================

-- ── 1. Base view: append the three contact columns ─────────────────────────
CREATE OR REPLACE VIEW public.v_learner_hostelites AS
 SELECT lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_email,
    lp.college_email,
    lp.gender,
    lp.institution_id,
    acc.code AS accommodation_type,
    lp.hostel_fee,
    lp.dayscholar_fee,
    lp.father_name,
    lp.mother_name,
    lp.admission_year_id,
    lp.degree_id,
    lp.department_id,
    lp.program_id,
    lp.semester_id,
    lp.section_id,
    lp.academic_year_id,
    pr.program_name,
    ay.year AS program_start_year,
    (ay.year::numeric + pr.program_duration_yrs)::integer AS program_end_year,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1, pr.program_duration_yrs::integer + 1))
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
            WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
            ELSE NULL::integer
        END AS year_of_study,
    ha.block_id AS current_block_id,
    ha.room_id AS current_room_id,
    ha.bed_id AS current_bed_id,
    ha.id AS current_allocation_id,
    hb.name AS current_block_name,
    hb.code AS current_block_code,
    hr.room_number AS current_room_number,
    hbd.bed_number AS current_bed_number,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN 'admission_year'::text
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
            WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
            ELSE NULL::text
        END AS year_source,
    dg.degree_name,
    sm.semester_name,
    lp.lifecycle_status,
    acy.academic_year_name,
    lp.hostel_category_id,
    hc.name AS hostel_category_name,
    hc.type AS hostel_category_type,
    lp.mess_category_id,
    mc.name AS mess_category_name,
    -- Appended 2026-09-02 (this migration). MUST stay last: CREATE OR REPLACE
    -- only permits adding columns at the end.
    lp.student_mobile,
    lp.father_mobile,
    lp.mother_mobile
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     LEFT JOIN profiles palloc ON palloc.learner_id = lp.id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = palloc.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
     LEFT JOIN hostel_beds hbd ON hbd.id = ha.bed_id
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
     LEFT JOIN academic_years acy ON acy.id = lp.academic_year_id
     LEFT JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
     LEFT JOIN mess_categories mc ON mc.id = lp.mess_category_id
  WHERE acc.code = 'hostel'::text AND lp.lifecycle_status::text = 'active'::text;

-- ── 2. Scoped view: re-expand `v.*` so it picks the three columns up ───────
-- Predicate reproduced verbatim from 20260624104223. Nothing about who can see
-- which rows changes here; this exists only to un-freeze the star.
CREATE OR REPLACE VIEW public.v_learner_hostelites_scoped
WITH (security_barrier = true) AS
SELECT v.*
FROM public.v_learner_hostelites v
WHERE
  is_super_admin()
  OR (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.user_block_access uba
        WHERE uba.user_id = auth.uid() AND uba.revoked_at IS NULL
      ) THEN v.current_block_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_block_access uba
        WHERE uba.user_id = auth.uid()
          AND uba.revoked_at IS NULL
          AND uba.block_id = v.current_block_id
      )
      ELSE role_has_institution_access(v.institution_id)
    END
  );
