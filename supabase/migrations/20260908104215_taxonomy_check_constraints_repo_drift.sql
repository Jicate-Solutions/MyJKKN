-- 20260908104215_taxonomy_check_constraints_repo_drift.sql
--
-- Make the FILES say what production already says. Two taxonomy CHECK
-- constraints admit 'jkkn_advanced' on production and the repo cannot
-- reproduce either of them.
--
-- ⚠️ THIS CHANGES NOTHING ON PRODUCTION. It is a REPO-DRIFT REPAIR, the same
-- shape as the 2026-08-04 IMS transfer-engine entry: the edits change what the
-- files say, so that a from-scratch replay produces production's state instead
-- of silently regressing it.
--
-- THE DRIFT, measured 2026-08-15
--
--   constraint                                  LIVE            REPO
--   chk_curriculum_lesson_primary_taxonomy      admits          declared
--     (supabase/migrations/20260801110000_       'jkkn_advanced' IN ('finks','blooms')
--      curriculum_lesson_taxonomy_columns.sql)                   -- NO jkkn_advanced
--   obe_regulation_config_taxonomy_type_check   admits          NO MIGRATION
--                                               'jkkn_advanced' DEFINES IT AT ALL
--
-- Both were altered directly against production and neither alter was ever
-- committed as a migration. So a rebuilt environment recreates
-- chk_curriculum_lesson_primary_taxonomy as the BINARY pair and then REJECTS
-- every 'jkkn_advanced' write with 23514 — while production accepts them. That
-- is a door open on exactly one machine.
--
-- This matters more than a normal drift because of the 2026-08-15 Director
-- ruling that JABT is used EVERYWHERE. The whole rollout depends on these two
-- predicates, spec §8.3 flags them by name as the blocker, and §8.3 records
-- them as already altered — a claim only production can corroborate today.
--
-- WHY THIS IS SAFE TO REPLAY AGAINST PRODUCTION
-- The new predicate is strictly WIDER than the old one in both cases: it is the
-- same value list plus 'jkkn_advanced'. A widening CHECK cannot fail validation
-- if the narrower one already held, so the ADD CONSTRAINT re-validation cannot
-- reject an existing row. curriculum_lesson carries 35,788 rows
-- (blooms 20,682 · NULL 15,082 · finks 24 · jkkn_advanced 0) and
-- obe_regulation_config carries 0.
--
-- REHEARSED ON PRODUCTION inside BEGIN … ROLLBACK on 2026-08-15: after running
-- exactly the statements below, pg_get_constraintdef returned definitions
-- BYTE-IDENTICAL to the ones already live — which is the proof that this file
-- is a no-op there rather than a change. A SEPARATE post-rollback call
-- confirmed production untouched: both constraints still present, both still
-- admitting jkkn_advanced, both convalidated.
--
-- NOT DONE HERE, deliberately: 20260801110000 is left exactly as it was. It is
-- an APPLIED migration and rewriting an applied file to say something it did
-- not say is how history stops being a record. This file supersedes it in
-- sequence instead, which is what migrations are for.

-- ── curriculum_lesson.primary_taxonomy ──────────────────────────────────────
ALTER TABLE public.curriculum_lesson
  DROP CONSTRAINT IF EXISTS chk_curriculum_lesson_primary_taxonomy;
ALTER TABLE public.curriculum_lesson
  ADD CONSTRAINT chk_curriculum_lesson_primary_taxonomy
  CHECK (primary_taxonomy IS NULL
         OR primary_taxonomy = ANY (ARRAY['blooms','finks','jkkn_advanced']));

-- ── obe_regulation_config.taxonomy_type ─────────────────────────────────────
-- No migration in this repo has ever defined this constraint. It exists on
-- production; this is its first appearance in version control.
ALTER TABLE public.obe_regulation_config
  DROP CONSTRAINT IF EXISTS obe_regulation_config_taxonomy_type_check;
ALTER TABLE public.obe_regulation_config
  ADD CONSTRAINT obe_regulation_config_taxonomy_type_check
  CHECK (taxonomy_type = ANY (ARRAY['blooms','finks','jkkn_advanced']));

-- ── Assert the end state, so this file cannot land half-applied ─────────────
DO $$
DECLARE
  n_lesson int;
  n_config int;
BEGIN
  SELECT count(*) INTO n_lesson FROM pg_constraint
   WHERE conname = 'chk_curriculum_lesson_primary_taxonomy'
     AND pg_get_constraintdef(oid) LIKE '%jkkn_advanced%';
  SELECT count(*) INTO n_config FROM pg_constraint
   WHERE conname = 'obe_regulation_config_taxonomy_type_check'
     AND pg_get_constraintdef(oid) LIKE '%jkkn_advanced%';

  IF n_lesson <> 1 THEN
    RAISE EXCEPTION
      'chk_curriculum_lesson_primary_taxonomy does not admit jkkn_advanced after this migration (found %)', n_lesson;
  END IF;
  IF n_config <> 1 THEN
    RAISE EXCEPTION
      'obe_regulation_config_taxonomy_type_check does not admit jkkn_advanced after this migration (found %)', n_config;
  END IF;
END $$;
