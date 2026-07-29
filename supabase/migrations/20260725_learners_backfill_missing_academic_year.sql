-- One-time data fix: stamp academic_year_id on in-scope learners who have none.
--
-- WHY: 15 learners surfaced on /billing/coverage as "Cannot evaluate" — their
-- profile carries no academic_year_id, so coverage cannot be computed for them
-- at all. Every one is a 2026-2027 admission-year learner in reserved/admitted
-- status with no roll number and no section: records created by the admission
-- flow, which sets admission_year_id but never academic_year_id.
--
-- DERIVATION: each learner's OWN institution's '2026-2027' academic year. The
-- join is on institution_id, so a learner can never receive another
-- institution's year row (the name '2026-2027' exists once per institution,
-- each with a distinct uuid).
--
-- SCOPE: deliberately limited to learners in institutions that actually bill —
-- the 15 visible on the coverage page. A further 15 learners in the three
-- non-billing institutions (Matric Hr. Sec. School, Arts & Science (Aided),
-- Nattraja Vidhyalya CBSE) have the identical defect and are intentionally NOT
-- touched here; they were not part of the request.
--
-- NOT A ROOT-CAUSE FIX: the admission write path still creates learners
-- without an academic year, so this set will regrow until that is addressed.

UPDATE public.learners_profiles lp
SET academic_year_id = ay.id,
    updated_at = now()
FROM public.academic_years ay
WHERE ay.institution_id = lp.institution_id
  AND TRIM(ay.academic_year_name) = '2026-2027'
  AND lp.academic_year_id IS NULL
  AND lp.lifecycle_status IN ('active','reserved','admitted','account')
  AND lp.institution_id IN (
    SELECT DISTINCT institution_id FROM public.billing_student_bills
  );
