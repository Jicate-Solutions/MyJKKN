-- 2026-06-17: Backfill admission_year_id for in-progress admission learners.
--
-- Learners sitting in the in-progress lifecycle stages (enquiry,
-- enquiry_submitted, account, reserved, admitted) belong to the CURRENT
-- admission cycle, but 26 of them had a NULL admission_year_id (mostly from
-- direct/QR self-fill entry paths that never stamped the year). The Group
-- Dashboard scopes by admission year, so these untagged learners were invisible
-- in the 2026-2027 cohort and the KPI card / drill-down counts disagreed.
--
-- Fix: stamp each NULL-year in-progress learner with THEIR OWN institution's
-- active current-year ("2026-2027") admission_year row. admission_years is
-- per-institution, and trg_validate_learner_admission_year_scope enforces that
-- the row matches the learner's institution — hence the institution-matched join.
--
-- Idempotent: only touches rows where admission_year_id IS NULL, so re-running
-- after the cohort is tagged is a no-op. Company / admin_office institutions
-- with no current-year admission_year row are skipped automatically (the join
-- finds no match) — they are non-academic and excluded from the dashboard.

UPDATE public.learners_profiles lp
   SET admission_year_id = ay.id
  FROM public.admission_years ay
 WHERE lp.admission_year_id IS NULL
   AND lp.lifecycle_status IN ('enquiry','enquiry_submitted','account','reserved','admitted')
   AND ay.institution_id = lp.institution_id
   AND ay.year = 2026
   AND ay.is_active = true;
