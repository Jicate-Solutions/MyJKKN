-- Migration: v_learner_hostelites with computed year_of_study + current allocation FKs
-- Purpose:   Enable filter pushdown for /campus-living/residents Learners tab
--            (BUG-003325 + BUG-003326). Year-of-study is NOT a stored column;
--            this view computes it from learners_profiles.admission_year_id →
--            admission_years.program_start_year and exposes it alongside the
--            current active hostel_allocation's block/room/bed.
--
-- Risk:      TIER-1 (data-touching but additive + reversible).
-- Rollback:  DROP VIEW public.v_learner_hostelites;
-- RLS:       Inherits from base tables (learners_profiles + admission_years +
--            hostel_allocations). No new policies required.
--
-- Director-approved 2026-05-10 via /myjkkn-api Round 1 #1 (assumption-thrash).

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
SELECT
  lp.id,
  lp.first_name,
  lp.last_name,
  lp.roll_number,
  lp.student_email,
  lp.college_email,
  lp.gender,
  lp.institution_id,
  lp.accommodation_type,
  lp.hostel_type,
  lp.hostel_fee,
  lp.dayscholar_fee,
  lp.father_name,
  lp.mother_name,
  lp.admission_year_id,
  ay.program_start_year,
  ay.program_end_year,
  GREATEST(1, LEAST(
    EXTRACT(YEAR FROM CURRENT_DATE)::int - COALESCE(ay.program_start_year, 0) + 1,
    COALESCE(ay.program_end_year, 9999) - COALESCE(ay.program_start_year, 0) + 1
  )) AS year_of_study,
  ha.block_id        AS current_block_id,
  ha.room_id         AS current_room_id,
  ha.bed_id          AS current_bed_id,
  ha.id              AS current_allocation_id
FROM public.learners_profiles lp
LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
LEFT JOIN public.hostel_allocations ha
  ON ha.learner_id = lp.id
 AND ha.status = 'active'
WHERE lp.accommodation_type = 'HOSTEL';

COMMENT ON VIEW public.v_learner_hostelites IS
  'Read-only view for /campus-living/residents Learners tab. Computes year_of_study (clamped 1..duration) and exposes current_block_id/room_id/bed_id from hostel_allocations status=active. PR pending — bugs BUG-003325 + BUG-003326.';
