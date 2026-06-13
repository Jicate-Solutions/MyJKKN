-- Fix cross-institution degree_id on learners_profiles
-- ----------------------------------------------------------------------------
-- Symptom: On /learners/profiles, selecting an Institution then a Degree and
-- clicking "Search Learners" returned an EMPTY table for several institutions
-- (Pharmacy, Allied Health Sciences, Engineering, Nursing).
--
-- Root cause (DATA, not code): 939 learners (937 active) had a degree_id pointing
-- at a degree row owned by a DIFFERENT institution -- all of them at JKKN Dental
-- College's "Undergraduate"/"Postgraduate" rows (likely a bulk-import that grabbed
-- the wrong degree UUID). The Degree dropdown is correctly scoped to the learner's
-- own institution, so the resulting filter (institution_id = X AND degree_id =
-- X's-own-degree) matched ZERO of these rows. department_id / program_id FKs were
-- clean (0 cross-institution mismatches) -- only degree was affected.
--
-- Fix: remap each affected learner's degree_id to the same-named ACTIVE degree
-- owned by its OWN institution. Verified unambiguous before applying:
--   939/939 resolved to exactly one target, 0 ambiguous, 0 missing,
--   2 distinct degree names involved (Undergraduate, Postgraduate).
--
-- Trigger safety: the SET clause touches only degree_id + updated_at.
--   * trigger_detect_fee_dimension_change: degree_id is NOT a monitored fee
--     dimension (it watches program_id/quota_id/community_category_id/
--     accommodation_type_id/admission_year_id) -> no-ops.
--   * set_learner_application_id: only generates when application_id IS NULL/'' ->
--     no-op for existing learners.
--   * column-scoped triggers (UPDATE OF lifecycle_status / institution_id /
--     program_id / admission_year_id / referred_by_id / college_email) do not fire.
-- ----------------------------------------------------------------------------

-- 1) Rollback backup of the exact (learner_id, old/new degree_id) mapping
CREATE TABLE IF NOT EXISTS public._bak_learner_degree_remap_20260608 (
  learner_id      uuid PRIMARY KEY,
  institution_id  uuid,
  old_degree_id   uuid,
  new_degree_id   uuid,
  degree_name     text,
  remapped_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_degree_remap_20260608
  (learner_id, institution_id, old_degree_id, new_degree_id, degree_name)
SELECT lp.id, lp.institution_id, lp.degree_id, t.id, d.degree_name
FROM public.learners_profiles lp
JOIN public.degrees d ON d.id = lp.degree_id
JOIN LATERAL (
  SELECT t2.id
  FROM public.degrees t2
  WHERE t2.institution_id = lp.institution_id
    AND lower(t2.degree_name) = lower(d.degree_name)
    AND t2.is_active = true
  ORDER BY t2.created_at
  LIMIT 1
) t ON true
WHERE d.institution_id <> lp.institution_id
ON CONFLICT (learner_id) DO NOTHING;

-- 2) Apply the remap from the verified mapping
UPDATE public.learners_profiles lp
SET degree_id  = b.new_degree_id,
    updated_at = now()
FROM public._bak_learner_degree_remap_20260608 b
WHERE lp.id = b.learner_id
  AND lp.degree_id = b.old_degree_id
  AND b.new_degree_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed):
--   UPDATE public.learners_profiles lp
--   SET degree_id = b.old_degree_id, updated_at = now()
--   FROM public._bak_learner_degree_remap_20260608 b
--   WHERE lp.id = b.learner_id AND lp.degree_id = b.new_degree_id;
-- Once confirmed good in production, the backup table may be dropped:
--   DROP TABLE public._bak_learner_degree_remap_20260608;
-- ----------------------------------------------------------------------------
