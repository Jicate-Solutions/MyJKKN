-- =====================================================================
-- SCF weld: dedupe NULL-institution suggestion zombies + NULL-proof the
-- dedupe index so fn_scf_record_suggestion's upsert can never duplicate.
-- =====================================================================
-- Updated: 2026-07-08 — APPLIED TO PROD 2026-07-08 ~07:10 IST via Management
-- API (this file is the repo record; re-running is safe/idempotent).
--
-- Root cause chain (receipts in PR body):
--   • idx_scf_ai_suggestions_dedupe COALESCEd faculty_email but left
--     institution_id raw. Postgres btree UNIQUE treats NULLs as DISTINCT, so a
--     NULL-institution row NEVER conflicts → the "upsert" INSERTed a fresh
--     duplicate on every batch re-drain (207 dupes for MR3691, 5–6 Jul 2026).
--   • Those NULL-institution rows are also permanently unmeasurable:
--     fn_scf_measure_suggestion_outcomes matches feedback rows with
--     institution_id IS NOT DISTINCT FROM suggestion.institution_id, and every
--     session_feedback row carries a real institution.
--   • PG 15.6 → use NULLS NOT DISTINCT (index-level) so NULL keys now conflict
--     like values. fn_scf_record_suggestion's ON CONFLICT column list is
--     unchanged and infers the rebuilt index.
--
-- Effect on prod at apply time: 215 rows → 9 (206 exact-dupe deletes), 1 row
-- institution-backfilled (MR3691 → its single real institution), after which
-- fn_scf_measure_suggestion_outcomes(1) measured it (+0.18 lift, 5 responses).

BEGIN;

-- 1) Dedupe: keep the EARLIEST row per logical key (ties broken by id).
DELETE FROM public.scf_ai_suggestions s
USING public.scf_ai_suggestions k
WHERE s.domain = k.domain
  AND s.course_code = k.course_code
  AND COALESCE(s.institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(k.institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(s.faculty_email, '') = COALESCE(k.faculty_email, '')
  AND s.window_from = k.window_from
  AND s.window_to   = k.window_to
  AND (k.generated_at, k.id) < (s.generated_at, s.id);

-- 2) Backfill institution on NULL rows whose course maps to exactly ONE
--    institution in session_feedback (deterministic — skips ambiguous courses).
UPDATE public.scf_ai_suggestions s
SET institution_id = f.inst, updated_at = now()
FROM (
  SELECT course_code, min(institution_id::text)::uuid AS inst
  FROM public.session_feedback
  WHERE institution_id IS NOT NULL
  GROUP BY course_code
  HAVING count(DISTINCT institution_id) = 1
) f
WHERE s.domain = 'session_feedback'
  AND s.institution_id IS NULL
  AND s.course_code = f.course_code;

-- 3) NULL-proof the dedupe index. NULL keys now conflict like values, so the
--    record-upsert updates in place instead of inserting a duplicate.
DROP INDEX IF EXISTS public.idx_scf_ai_suggestions_dedupe;
CREATE UNIQUE INDEX idx_scf_ai_suggestions_dedupe
  ON public.scf_ai_suggestions (
    institution_id, course_code, COALESCE(faculty_email, ''),
    window_from, window_to, domain
  ) NULLS NOT DISTINCT;

COMMIT;
