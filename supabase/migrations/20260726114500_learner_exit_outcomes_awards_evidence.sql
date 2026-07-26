-- ============================================================================
-- Accreditation — learner exit outcomes + awards home wired into the quality
-- evidence spine (Wave 2C: learner outcome capture)
-- File: 20260726114500_learner_exit_outcomes_awards_evidence.sql
-- Date: 2026-07-26
--
-- WHY
--   NAAC-2024 Binary Framework Attribute 8 (Student Outcomes) metrics for
--   graduate progression (8.2.1) and learner awards & recognitions (8.3 —
--   seeded here) sit at ZERO per-record evidence rows in
--   quality_evidence_mappings. The coverage audit gaplines: "Add a 5-field
--   exit-outcome capture per graduating learner" (8.2) and "Extend the
--   achievements entry to academic awards" (8.3).
--
-- EXISTING-TABLE SURVEY (parallel-mechanism prevention, decided 2026-07-26):
--   - alumni_outcomes            → ALREADY IS the per-learner exit-outcome
--       capture: outcome_type enum {employed, self_employed, entrepreneur,
--       higher_studies, competitive_exams, family_business, gap_year, seeking,
--       unknown}, company_name / institution_name / business_name
--       (organisation-or-institution), designation / course_name
--       (program-or-role), graduation_date + graduation_year (year),
--       verification_status + verification_notes (verification). 4 explicit
--       RLS policies (SELECT/INSERT/UPDATE/DELETE) live in prod. Fed by two
--       existing CDC bridge triggers (fn_cdc_passed_out_to_alumni_bridge,
--       fn_cdc_placement_to_alumni). NO new capture table is created — this
--       migration only adds the per-record evidence fan-out trigger.
--   - cdc_placement_outcome_cycles (PR #1904) → the DARK cron-driven COHORT-
--       AGGREGATE 8.2.1 emitter (source_table='cdc_placement_outcome_cycles',
--       gated by cdc_placement_loop.master_enabled). Different source_table →
--       different natural key → NO collision with this per-record fan-out.
--       Left untouched.
--   - health_sports_achievements → the recordable-today achievements entry
--       (learner self-entry at /health/achievements + tournament auto-writer
--       fn_award_achievements). Sports-only (sport NOT NULL). WIDENED here
--       with a category column ('sports' default | academic | cultural |
--       other) + sport made nullable for non-sports awards — this becomes the
--       awards home instead of a new table.
--   - pp_achievements            → considered and SKIPPED as the awards home:
--       parent-portal communication records (no verification workflow, no
--       event level, misspelt institutions_id FK, 0 rows). Not wired.
--
-- METRIC-CODE HONESTY (catalog verified live 2026-07-26):
--   The wave brief named 8.2.1/8.2.2, but the LIVE catalog says
--   8.2.2 = 'Pass percentage in university examinations (Affiliated
--   colleges)' — an exam-results metric, NOT graduate progression. Emitting
--   exit outcomes there would be wrong. So ALL progression kinds (placement /
--   higher education / entrepreneurship) emit to 8.2.1 ('Placement + higher
--   studies progression', whose own calculation_method already points at
--   alumni_outcomes), with the kind carried in metadata so 8.2.1 evidence can
--   be sliced per progression flavour. 8.2.2 is deliberately NOT touched.
--
-- WHAT THIS ADDS
--   1. Seed NAAC metric 8.3 (learner awards & recognitions) — WHERE NOT
--      EXISTS, matching the 20260709030000 catalog row style.
--   2. Widen health_sports_achievements: + category column (CHECK sports/
--      academic/cultural/other, default 'sports' so both existing writers are
--      untouched), sport → nullable with CHECK (sports rows must still name
--      the sport).
--   3. Trigger-based evidence fan-out — the CANONICAL mechanism for
--      human-entered records (same pattern as the C6 MoU/grants register,
--      anti-ragging 20260417000002 and grievance 20260422 fan-outs):
--        alumni_outcomes, outcome_type in (employed, self_employed,
--          entrepreneur, higher_studies)            → NAAC 8.2.1
--        health_sports_achievements, verified=true  → NAAC 8.3
--      Upserts on the junction's natural key (source_table, source_id,
--      body_code, metric_code); refreshes metadata on edit; withdraws on
--      state regression (outcome edited to seeking/unknown/etc., achievement
--      un-verified); never clobbers a manually-curated (is_auto=false)
--      mapping; AFTER DELETE cleanup so evidence never dangles.
--      K-ANONYMITY: mapping metadata carries kind/category + year + level
--      only — never learner names, employer names, packages or any other
--      personal detail. Auditors reach the source row via
--      (source_table, source_id).
--   4. quality_evidence_source_registry rows for both sources — CONFIG rows,
--      seeded with INSERT ... WHERE NOT EXISTS (never ON CONFLICT).
--      source_kind values 'learner_exit_outcome' + 'learner_achievement' —
--      verified free against live registry kinds (accreditation_submission,
--      admission_naac_evidence, anti_ragging_affidavit, grievance_ticket,
--      hostel_incident, ip_filing, pde_naac_evidence, sh_publication) and
--      tonight's sibling waves (institution_collaboration, ss_grant, event,
--      hr_snapshot).
--
-- SECURITY
--   Trigger functions are SECURITY DEFINER SET search_path = public (same as
--   emit_grievance_evidence / emit_institution_collaboration_evidence). They
--   RETURN trigger — not callable via PostgREST — but EXECUTE is still
--   revoked from anon, authenticated and PUBLIC per the mandatory lockdown
--   template (2026-06-06); trigger fire-time does not require caller EXECUTE.
--   NOTED RISK (pre-existing, unchanged): health_sports_achievements carries
--   a learner self-write RLS policy; the 8.3 emit gate is verified=true set
--   by staff (verified_by recorded as mapped_by), which is the strongest
--   available signal on that table today.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed NAAC metric 8.3 — learner awards & recognitions (Attribute 8).
--    WHERE NOT EXISTS (idempotent; UNIQUE (metric_type, metric_code) verified
--    live). Row style matches 20260709030000.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, calculation_method, notes)
SELECT
  'NAAC', '8.3',
  'Learner awards & recognitions — academic, sports, cultural & co-curricular (count)',
  'Attribute 8: Student Outcomes', true, true,
  'health_sports_achievements WHERE verified=true (all categories)',
  'Evidence auto-emitted per verified achievement by emit_learner_achievement_evidence — one row per verified award (category sports/academic/cultural/other), refreshed on edit, withdrawn when un-verified. Seeded 2026-07-26 (Wave 2C learner outcome capture).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '8.3'
);

-- ----------------------------------------------------------------------------
-- 2. Widen health_sports_achievements into the awards home.
--    Default 'sports' keeps both existing writers (self-entry form +
--    fn_award_achievements) valid unchanged; sport becomes nullable ONLY for
--    non-sports categories.
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_sports_achievements
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'sports';

ALTER TABLE public.health_sports_achievements
  DROP CONSTRAINT IF EXISTS hsa_category_check;
ALTER TABLE public.health_sports_achievements
  ADD CONSTRAINT hsa_category_check
  CHECK (category IN ('sports', 'academic', 'cultural', 'other'));

ALTER TABLE public.health_sports_achievements
  ALTER COLUMN sport DROP NOT NULL;

ALTER TABLE public.health_sports_achievements
  DROP CONSTRAINT IF EXISTS hsa_sport_required_for_sports_check;
ALTER TABLE public.health_sports_achievements
  ADD CONSTRAINT hsa_sport_required_for_sports_check
  CHECK (category <> 'sports' OR sport IS NOT NULL);

COMMENT ON COLUMN public.health_sports_achievements.category IS
  'Award category — sports (default; sport column required) | academic | cultural | other. Widened 2026-07-26 (Wave 2C) so external academic awards have a home; verified rows of every category emit NAAC 8.3 evidence via emit_learner_achievement_evidence.';

-- ----------------------------------------------------------------------------
-- 3. Evidence source registry rows — CONFIG, seeded WHERE NOT EXISTS
--    (never ON CONFLICT, per registry seeding rule).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'learner_exit_outcome', 'alumni_outcomes',
       'Learner Exit Outcomes (Graduate Progression)',
       'Per-learner exit outcomes (placement / higher education / entrepreneurship) emit NAAC 8.2.1 evidence. Trigger-emitted on save (emit_learner_exit_outcome_evidence), refreshed on edit, withdrawn when the outcome regresses to seeking/unknown/other non-progression kinds. Metadata is k-anonymous (kind + year only). The DARK cohort-aggregate emitter (cdc_placement_outcome_cycles, PR #1904) is a separate source and is untouched.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'learner_exit_outcome'
     OR source_table = 'alumni_outcomes'
);

INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'learner_achievement', 'health_sports_achievements',
       'Learner Awards & Achievements',
       'Verified learner achievements (sports / academic / cultural / other) emit NAAC 8.3 evidence. Trigger-emitted when verified (emit_learner_achievement_evidence), refreshed on edit, withdrawn when un-verified or when the learner has no institution on file.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'learner_achievement'
     OR source_table = 'health_sports_achievements'
);

-- ----------------------------------------------------------------------------
-- 4. Fan-out trigger — alumni_outcomes → NAAC 8.2.1 (per-record).
--    Progression kinds (employed / self_employed / entrepreneur /
--    higher_studies) emit; anything else withdraws the auto row (state
--    regression). Manual (is_auto=false) mappings are never touched.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_learner_exit_outcome_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progression boolean;
BEGIN
  v_progression := NEW.outcome_type::text IN
    ('employed', 'self_employed', 'entrepreneur', 'higher_studies');

  -- Withdraw AUTO evidence that no longer matches this row (outcome edited
  -- back to a non-progression kind, or a stray row on another code).
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = 'alumni_outcomes'
    AND source_id = NEW.id
    AND is_auto
    AND (NOT v_progression OR metric_code <> '8.2.1' OR body_code <> 'NAAC');

  IF v_progression THEN
    INSERT INTO public.quality_evidence_mappings (
      source_table, source_id, institution_id,
      body_code, metric_code, period_label,
      mapped_by, is_auto, metadata, mapped_at
    ) VALUES (
      'alumni_outcomes', NEW.id, NEW.institution_id,
      'NAAC', '8.2.1',
      public.fn_accreditation_ay_label(NEW.graduation_date::timestamptz),
      NEW.created_by, true,
      -- K-ANONYMOUS: kind + year + verification band only. No names, no
      -- employers, no packages — auditors reach the source row by id.
      jsonb_build_object(
        'outcome_kind',        NEW.outcome_type::text,
        'graduation_year',     COALESCE(NEW.graduation_year,
                                        EXTRACT(YEAR FROM NEW.graduation_date)::int),
        'verification_status', NEW.verification_status::text,
        'source_trigger',      'emit_learner_exit_outcome_evidence'
      ),
      now()
    )
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET institution_id = EXCLUDED.institution_id,
          period_label   = EXCLUDED.period_label,
          metadata       = EXCLUDED.metadata,
          is_auto        = true,
          mapped_at      = now()
      WHERE public.quality_evidence_mappings.is_auto;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_learner_exit_outcome_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_learner_exit_outcome_evidence() IS
  'Wave 2C: fans per-learner alumni_outcomes rows with progression kinds (employed / self_employed / entrepreneur / higher_studies) into quality_evidence_mappings as NAAC 8.2.1 evidence. K-anonymous metadata (kind + year). Refreshes on edit, withdraws on regression to non-progression kinds, never clobbers manual (is_auto=false) mappings. The DARK cohort-aggregate emitter (fn_cdc_placement_outcome_measure) uses a different source_table and is unaffected.';

DROP TRIGGER IF EXISTS trg_alumni_outcomes_evidence_fanout ON public.alumni_outcomes;
CREATE TRIGGER trg_alumni_outcomes_evidence_fanout
AFTER INSERT OR UPDATE ON public.alumni_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.emit_learner_exit_outcome_evidence();

-- ----------------------------------------------------------------------------
-- 5. Fan-out trigger — health_sports_achievements → NAAC 8.3.
--    Only VERIFIED achievements emit (un-verified self-entries are not
--    evidence). institution_id is resolved via the learner's profile; rows
--    whose learner has no institution are skipped (junction requires it).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_learner_achievement_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  IF NOT COALESCE(NEW.verified, false) THEN
    -- State regression: un-verified (or never verified) → no auto evidence.
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  SELECT lp.institution_id INTO v_institution_id
  FROM public.learners_profiles lp
  WHERE lp.id = NEW.learner_id;

  IF v_institution_id IS NULL THEN
    DELETE FROM public.quality_evidence_mappings
    WHERE source_table = 'health_sports_achievements'
      AND source_id = NEW.id
      AND is_auto;
    RETURN NEW;
  END IF;

  INSERT INTO public.quality_evidence_mappings (
    source_table, source_id, institution_id,
    body_code, metric_code, period_label,
    mapped_by, is_auto, metadata, mapped_at
  ) VALUES (
    'health_sports_achievements', NEW.id, v_institution_id,
    'NAAC', '8.3',
    public.fn_accreditation_ay_label(NEW.achievement_date::timestamptz),
    NEW.verified_by, true,
    -- K-ANONYMOUS: category / type / level / event / year — no learner detail.
    jsonb_build_object(
      'category',         NEW.category,
      'achievement_type', NEW.achievement_type,
      'event_level',      NEW.event_level,
      'event_name',       NEW.event_name,
      'achievement_year', EXTRACT(YEAR FROM NEW.achievement_date)::int,
      'source_trigger',   'emit_learner_achievement_evidence'
    ),
    now()
  )
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET institution_id = EXCLUDED.institution_id,
        period_label   = EXCLUDED.period_label,
        metadata       = EXCLUDED.metadata,
        is_auto        = true,
        mapped_at      = now()
    WHERE public.quality_evidence_mappings.is_auto;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_learner_achievement_evidence() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.emit_learner_achievement_evidence() IS
  'Wave 2C: fans VERIFIED health_sports_achievements rows (all categories — sports / academic / cultural / other) into quality_evidence_mappings as NAAC 8.3 (learner awards & recognitions) evidence. institution resolved via learners_profiles. Refreshes on edit, withdraws when un-verified or institution missing, never clobbers manual (is_auto=false) mappings.';

DROP TRIGGER IF EXISTS trg_hsa_evidence_fanout ON public.health_sports_achievements;
CREATE TRIGGER trg_hsa_evidence_fanout
AFTER INSERT OR UPDATE ON public.health_sports_achievements
FOR EACH ROW
EXECUTE FUNCTION public.emit_learner_achievement_evidence();

-- ----------------------------------------------------------------------------
-- 6. Delete hygiene — auto-emitted evidence must not dangle at a deleted
--    source row. Manual mappings survive (an auditor may have pinned them).
--    Self-contained fn (sibling C6 ships an equivalent under its own name;
--    neither migration depends on the other).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_learner_outcome_evidence_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = TG_TABLE_NAME
    AND source_id = OLD.id
    AND is_auto;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_learner_outcome_evidence_cleanup() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_learner_outcome_evidence_cleanup() IS
  'Wave 2C: AFTER DELETE cleanup for evidence-emitting learner-outcome sources — removes AUTO quality_evidence_mappings rows (source_table = TG_TABLE_NAME) so evidence never points at a deleted outcome/achievement row. Manual (is_auto=false) mappings survive.';

DROP TRIGGER IF EXISTS trg_alumni_outcomes_evidence_cleanup ON public.alumni_outcomes;
CREATE TRIGGER trg_alumni_outcomes_evidence_cleanup
AFTER DELETE ON public.alumni_outcomes
FOR EACH ROW
EXECUTE FUNCTION public.fn_learner_outcome_evidence_cleanup();

DROP TRIGGER IF EXISTS trg_hsa_evidence_cleanup ON public.health_sports_achievements;
CREATE TRIGGER trg_hsa_evidence_cleanup
AFTER DELETE ON public.health_sports_achievements
FOR EACH ROW
EXECUTE FUNCTION public.fn_learner_outcome_evidence_cleanup();

-- ----------------------------------------------------------------------------
-- 7. Apply-time asserts — fail loudly at apply rather than the triggers
--    failing silently forever (same discipline as 20260709023000).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the fan-out upserts depend on it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND metric_code = '8.2.1'
  ) THEN
    RAISE EXCEPTION 'NAAC metric 8.2.1 missing from sh_accreditation_metrics — exit-outcome evidence would target a nonexistent metric';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND metric_code = '8.3'
  ) THEN
    RAISE EXCEPTION 'NAAC metric 8.3 missing after seed — awards evidence would target a nonexistent metric';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the widened table resolves immediately
-- after a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
