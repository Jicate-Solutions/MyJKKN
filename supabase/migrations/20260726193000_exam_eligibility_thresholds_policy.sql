-- ============================================================================
-- Exam attendance eligibility thresholds become CONFIGURATION.
-- Updated: 2026-07-26 — Director confirmed the 75/65 rule and approved moving it
-- onto one config row ("every policy decision = a config row").
--
-- WHY
-- The rule had NO config row anywhere. It was a hardcoded constant pair duplicated
-- in FOUR places, whose only stated authority was the code comment "// university
-- norm":
--   lib/services/exam-audit/compute.ts          (Registrar's exam audit)
--   components/session-feedback/my-running-score-card.tsx  (every learner)
--   .../consolidation/_components/confirmed-attendance-advisory-panel.tsx
--   lib/academic/guide/content.ts               (Senior Learner guide prose)
-- Four hand-maintained copies of a regulatory threshold drift. They now all resolve
-- from these two rows (the guide prose renders the code default, since it is static
-- content compiled at build time).
--
-- IT IS A THREE-BAND RULE, not a pass/fail gate:
--   pct >= attendance_pct                          -> eligible
--   condonation_floor_pct <= pct < attendance_pct   -> needs condonation
--   pct <  condonation_floor_pct                    -> at risk of ineligibility
--
-- SCOPE-AWARE BY DESIGN
-- Seeded global. fn_get_policy resolves user > institution > role > global, so a
-- college on a different affiliating-university norm gets its own institution-scoped
-- row with no code change. Readers pass institutionId where they have one.
--
-- DO NOT CONFLATE with the other similarly-valued 75s in this database — they are
-- different concepts and must keep their own rows:
--   internal_marks_insight_config.attendance_threshold  ("counts as regular")
--   cdc.min_attendance_pct_for_internship_certificate
--   internship.policy.attendance_fail_below_pct / ..._warn_below_pct
--   vac.completion_attendance_threshold
--
-- SEED PATTERN: WHERE NOT EXISTS, never ON CONFLICT — platform_policies is keyed by
-- an EXPRESSION unique index, so ON CONFLICT (policy_key, scope_type, scope_id)
-- fails with 42P10. Idempotent: re-running changes nothing, and in particular will
-- NOT reset a value an administrator has since tuned.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type,
  is_system, is_active, classification, ui_widget, ui_category, ui_consequence,
  publication_state
)
SELECT
  'academic.exam_eligibility.attendance_pct',
  'global',
  NULL,
  '75'::jsonb,
  'Attendance percentage at or above which a learner is eligible to sit the university examination. Below this, condonation is required.',
  'number',
  true,
  true,
  'major',
  'number',
  'Exam Eligibility',
  'Changes who is reported as exam-eligible across the Registrar''s exam audit, every learner''s eligibility card, and the consolidation advisory panel. Raising it moves learners into the condonation band; lowering it moves them out.',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'academic.exam_eligibility.attendance_pct'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type,
  is_system, is_active, classification, ui_widget, ui_category, ui_consequence,
  publication_state
)
SELECT
  'academic.exam_eligibility.condonation_floor_pct',
  'global',
  NULL,
  '65'::jsonb,
  'Attendance percentage below which a learner is at risk of ineligibility. Between this and the eligibility percentage, condonation applies.',
  'number',
  true,
  true,
  'major',
  'number',
  'Exam Eligibility',
  'Changes who is reported as at risk of ineligibility. Must stay BELOW academic.exam_eligibility.attendance_pct — a floor at or above the eligibility line would leave the condonation band empty.',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'academic.exam_eligibility.condonation_floor_pct'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- Sanity: both rows must exist and the floor must sit below the eligibility line.
DO $$
DECLARE
  v_elig numeric;
  v_cond numeric;
BEGIN
  SELECT (value #>> '{}')::numeric INTO v_elig
  FROM public.platform_policies
  WHERE policy_key = 'academic.exam_eligibility.attendance_pct'
    AND scope_type = 'global' AND scope_id IS NULL;

  SELECT (value #>> '{}')::numeric INTO v_cond
  FROM public.platform_policies
  WHERE policy_key = 'academic.exam_eligibility.condonation_floor_pct'
    AND scope_type = 'global' AND scope_id IS NULL;

  IF v_elig IS NULL OR v_cond IS NULL THEN
    RAISE EXCEPTION 'ABORT: eligibility policy rows missing after seed (elig=%, cond=%)',
      v_elig, v_cond;
  END IF;

  IF v_cond >= v_elig THEN
    RAISE EXCEPTION 'ABORT: condonation floor (%) must be below the eligibility line (%)',
      v_cond, v_elig;
  END IF;

  RAISE NOTICE 'exam eligibility thresholds: eligible >= %%%, at risk < %%%', v_elig, v_cond;
END $$;
