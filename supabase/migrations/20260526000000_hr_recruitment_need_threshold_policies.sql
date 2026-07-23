-- ============================================================================
-- Threshold policy seeds for the 7 recruitment-need signal inputs
-- Each input gets an amber (warning) and red (critical) threshold.
-- ============================================================================

INSERT INTO public.platform_policies
  (policy_key, value, description, scope_type, data_type, ui_widget, ui_category, is_active)
VALUES
  -- Sanctioned Gap: % of norm — lower is worse
  ('hr_recruitment.threshold_amber_sanctioned_gap', '100'::jsonb,
   'Amber threshold for sanctioned-vs-actual gap (% of norm — amber if below this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_sanctioned_gap',   '80'::jsonb,
   'Red threshold for sanctioned-vs-actual gap (% of norm — red if below this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- SFR: higher is worse (more students per faculty)
  ('hr_recruitment.threshold_amber_sfr',            '100'::jsonb,
   'Amber threshold for student-faculty ratio (% of norm — amber if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_sfr',              '120'::jsonb,
   'Red threshold for student-faculty ratio (% of norm — red if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- Specialization Gap: % coverage — lower is worse
  ('hr_recruitment.threshold_amber_specialization_gap', '80'::jsonb,
   'Amber threshold for specialization coverage (% — amber if below this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_specialization_gap',   '60'::jsonb,
   'Red threshold for specialization coverage (% — red if below this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- Workload: higher is worse (overwork)
  ('hr_recruitment.threshold_amber_workload',       '100'::jsonb,
   'Amber threshold for faculty workload (% of norm — amber if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_workload',         '120'::jsonb,
   'Red threshold for faculty workload (% of norm — red if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- Projected Intake: higher is worse (more incoming students)
  ('hr_recruitment.threshold_amber_projected_intake', '100'::jsonb,
   'Amber threshold for projected next-AY intake (% of norm — amber if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_projected_intake',   '120'::jsonb,
   'Red threshold for projected next-AY intake (% of norm — red if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- Attrition Pipeline: % of staff at risk — higher is worse
  ('hr_recruitment.threshold_amber_attrition_pipeline', '10'::jsonb,
   'Amber threshold for attrition pipeline (% of staff at risk — amber if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_attrition_pipeline',   '20'::jsonb,
   'Red threshold for attrition pipeline (% of staff at risk — red if above this)',
   'global', 'number', 'number', 'hr_recruitment', true),

  -- Peer Benchmark: % of peer average — lower is worse
  ('hr_recruitment.threshold_amber_peer_benchmark', '90'::jsonb,
   'Amber threshold for peer benchmark comparison (% — amber if below this)',
   'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.threshold_red_peer_benchmark',   '75'::jsonb,
   'Red threshold for peer benchmark comparison (% — red if below this)',
   'global', 'number', 'number', 'hr_recruitment', true)
ON CONFLICT DO NOTHING;

-- Verification: count total hr_recruitment threshold policies
DO $$ DECLARE v_count int; BEGIN
  SELECT count(*) INTO v_count
  FROM public.platform_policies
  WHERE policy_key LIKE 'hr_recruitment.threshold_%';
  RAISE NOTICE 'Threshold policies: % rows (expected 14)', v_count;
END $$;
