-- ============================================================================
-- HR Recruitment Need Signal — Signal + Operational Tables (PR 2 of ~33-40)
-- ============================================================================
-- Spec: specs/hr-recruitment-need-signal-2026-05-24.md (53 decisions)
-- Depends on: PR #1069 (foundation — hr_regulatory_bodies, etc.)
--
-- This migration creates:
--   1. hr_recruitment_signal_inputs — plugin registry for extensible inputs (AT.7)
--   2. hr_recruitment_signal_cache — 1-hour materialized signal cache (F1.3)
--   3. hr_recruitment_signal_suppressions — Director snooze records (F1.9)
--   4. hr_recruitment_escalations — Principal → Director queue (F2.11, AT.8)
--   5. hr_recruitment_user_visits — last dashboard visit per user (F2.13)
--   6. hr_recruitment_signal_snapshots — point-in-time frozen signals (Feature 5)
--   7. hr_faculty_workload — per-faculty-per-semester teaching hours (Feature 4)
--   + Policy seed rows (11 platform_policies for weights/thresholds)
--   + Storage bucket: hr-recruitment-escalation-docs
--   + RLS on all new tables
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. hr_recruitment_signal_inputs — plugin registry (Decision AT.7)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_signal_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  computation_function_ref text,
  default_weight numeric(5,2) NOT NULL DEFAULT 14.29,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_recruitment_signal_inputs IS
  'Plugin registry for extensible signal inputs (Decision AT.7). 7 system inputs seeded; Director can add more via admin UI.';

INSERT INTO public.hr_recruitment_signal_inputs (input_key, label, description, default_weight, display_order, is_system)
VALUES
  ('sanctioned_gap',     'Sanctioned vs. Actual',     'Regulatory-body-approved headcount minus active staff count',     14.29, 1, true),
  ('sfr',                'Student-Faculty Ratio',     'SFR compared to regulatory body norm per program type',          14.29, 2, true),
  ('specialization_gap', 'Specialization Coverage',   'Required specializations vs. faculty specializations on file',   14.29, 3, true),
  ('workload',           'Faculty Workload',          'Contact hours per week vs. regulatory teaching norm',            14.29, 4, true),
  ('projected_intake',   'Projected Intake',          'Next AY intake from admission funnel vs. current faculty',      14.29, 5, true),
  ('attrition_pipeline', 'Attrition Pipeline',        'Resignations submitted + retirements due in next 6-12 months',  14.29, 6, true),
  ('peer_benchmark',     'Peer Benchmark',            'JKKN metrics vs. peer institutions of same NAAC grade',         14.29, 7, true)
ON CONFLICT (input_key) DO NOTHING;

-- ============================================================================
-- 2. hr_recruitment_signal_cache — computed signal cache (Decision F1.3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_signal_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  program_id uuid,
  department_id uuid,
  granularity_level text NOT NULL DEFAULT 'program'
    CHECK (granularity_level IN ('program', 'department')),
  composite_score numeric(5,2),
  input_signals jsonb NOT NULL DEFAULT '{}',
  overall_status text NOT NULL DEFAULT 'insufficient_data'
    CHECK (overall_status IN ('green', 'amber', 'red', 'blocked', 'insufficient_data')),
  blocked_inputs text[],
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by_function text,
  financial_year text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_signal_cache_inst_prog
    UNIQUE (institution_id, program_id, department_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_signal_cache_inst ON public.hr_recruitment_signal_cache(institution_id);
CREATE INDEX IF NOT EXISTS idx_signal_cache_status ON public.hr_recruitment_signal_cache(overall_status);

COMMENT ON TABLE public.hr_recruitment_signal_cache IS
  '1-hour TTL signal cache (Decision F1.3). input_signals maps input_key → {status, value, norm, raw}. blocked_inputs lists missing-data inputs (Decision F1.2). raw_data for side-by-side audit (F1.7).';

-- ============================================================================
-- 3. hr_recruitment_signal_suppressions — Director snooze (Decision F1.9)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_signal_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  program_id uuid,
  department_id uuid,
  suppressed_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  suppress_until date NOT NULL,
  unsnoozed_at timestamptz,
  unsnoozed_reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_suppress_active ON public.hr_recruitment_signal_suppressions(is_active) WHERE is_active = true;

COMMENT ON TABLE public.hr_recruitment_signal_suppressions IS
  'Director snooze records (F1.9). Visible to all roles (F2.12). Un-snooze via unsnoozed_at + reason (AT.6).';

-- ============================================================================
-- 4. hr_recruitment_escalations — Principal → Director (F2.11, AT.8)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  program_id uuid,
  department_id uuid,
  escalated_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  resolution_notes text,
  documents jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON public.hr_recruitment_escalations(status);

COMMENT ON TABLE public.hr_recruitment_escalations IS
  'Principal → Director escalation queue (AT.8: pending → acknowledged → resolved/dismissed). documents stores Storage refs (AT.9).';

-- ============================================================================
-- 5. hr_recruitment_user_visits — change tracking (F2.13)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_user_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  last_visited_at timestamptz NOT NULL DEFAULT now(),
  signals_at_visit jsonb,
  CONSTRAINT uq_user_visits UNIQUE (user_id)
);

COMMENT ON TABLE public.hr_recruitment_user_visits IS
  'Last dashboard visit per user for "N changes since last visit" badge (F2.13).';

-- ============================================================================
-- 6. hr_recruitment_signal_snapshots — point-in-time freeze (Feature 5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_recruitment_signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_name text NOT NULL,
  snapshot_description text,
  taken_by uuid NOT NULL REFERENCES public.profiles(id),
  taken_at timestamptz NOT NULL DEFAULT now(),
  financial_year text,
  scope_institution_id uuid REFERENCES public.institutions(id),
  signal_data jsonb NOT NULL,
  metadata jsonb,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_taken_at ON public.hr_recruitment_signal_snapshots(taken_at DESC);

COMMENT ON TABLE public.hr_recruitment_signal_snapshots IS
  'Point-in-time frozen signals for board meetings (Feature 5). Immutable. Powers YoY comparison.';

-- ============================================================================
-- 7. hr_faculty_workload — teaching hours capture (Feature 4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hr_faculty_workload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  academic_year text NOT NULL,
  semester integer NOT NULL CHECK (semester IN (1, 2)),
  weekly_contact_hours numeric(4,1) NOT NULL,
  weekly_admin_hours numeric(4,1) DEFAULT 0,
  weekly_research_hours numeric(4,1) DEFAULT 0,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'timetable_import', 'self_report')),
  entered_by uuid REFERENCES public.profiles(id),
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_faculty_workload UNIQUE (staff_id, institution_id, academic_year, semester)
);

CREATE INDEX IF NOT EXISTS idx_faculty_workload_inst_year ON public.hr_faculty_workload(institution_id, academic_year);

COMMENT ON TABLE public.hr_faculty_workload IS
  'Per-faculty-per-semester teaching hours (Feature 4, Input #1). source: manual/timetable_import/self_report.';

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.hr_recruitment_signal_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY signal_inputs_select ON public.hr_recruitment_signal_inputs FOR SELECT USING (true);
CREATE POLICY signal_inputs_write ON public.hr_recruitment_signal_inputs FOR ALL USING (public.is_super_admin() OR public.is_admin()) WITH CHECK (public.is_super_admin() OR public.is_admin());

ALTER TABLE public.hr_recruitment_signal_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY signal_cache_select ON public.hr_recruitment_signal_cache FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND (a.institution_id = hr_recruitment_signal_cache.institution_id OR a.role_key IN ('director','trust_secretary','chairperson')) AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','vice_principal','cao','registrar','trust_secretary','chairperson'))
);
CREATE POLICY signal_cache_write ON public.hr_recruitment_signal_cache FOR ALL USING (public.is_super_admin() OR public.is_admin()) WITH CHECK (public.is_super_admin() OR public.is_admin());

ALTER TABLE public.hr_recruitment_signal_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppressions_select ON public.hr_recruitment_signal_suppressions FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND (a.institution_id = hr_recruitment_signal_suppressions.institution_id OR a.role_key IN ('director','trust_secretary','chairperson')) AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','vice_principal','cao','registrar','trust_secretary','chairperson'))
);
CREATE POLICY suppressions_write ON public.hr_recruitment_signal_suppressions FOR ALL USING (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key = 'director')) WITH CHECK (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key = 'director'));

ALTER TABLE public.hr_recruitment_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalations_select ON public.hr_recruitment_escalations FOR SELECT USING (
  public.is_super_admin() OR public.is_admin() OR escalated_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND (a.institution_id = hr_recruitment_escalations.institution_id OR a.role_key IN ('director','trust_secretary','chairperson')) AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','vice_principal','cao','trust_secretary','chairperson'))
);
CREATE POLICY escalations_insert ON public.hr_recruitment_escalations FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key IN ('principal','vice_principal','director')));
CREATE POLICY escalations_update ON public.hr_recruitment_escalations FOR UPDATE USING (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key IN ('director','trust_secretary','chairperson')));

ALTER TABLE public.hr_recruitment_user_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_visits_select ON public.hr_recruitment_user_visits FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY user_visits_write ON public.hr_recruitment_user_visits FOR ALL USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

ALTER TABLE public.hr_recruitment_signal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY snapshots_select ON public.hr_recruitment_signal_snapshots FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','vice_principal','cao','registrar','trust_secretary','chairperson'))
);
CREATE POLICY snapshots_write ON public.hr_recruitment_signal_snapshots FOR ALL USING (public.is_super_admin() OR public.is_admin()) WITH CHECK (public.is_super_admin() OR public.is_admin());

ALTER TABLE public.hr_faculty_workload ENABLE ROW LEVEL SECURITY;
CREATE POLICY workload_select ON public.hr_faculty_workload FOR SELECT USING (
  public.is_super_admin() OR public.is_admin()
  OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = hr_faculty_workload.staff_id AND s.profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND (a.institution_id = hr_faculty_workload.institution_id OR a.role_key IN ('director','trust_secretary','chairperson')) AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director','principal','vice_principal','cao'))
);
CREATE POLICY workload_write ON public.hr_faculty_workload FOR ALL USING (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director'))) WITH CHECK (public.is_super_admin() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.staff a WHERE a.profile_id = auth.uid() AND a.role_key IN ('hr_officer','hr_admin','hr_manager','director')));

-- ============================================================================
-- Policy seeds
-- ============================================================================
INSERT INTO public.platform_policies (policy_key, value, description, scope_type, data_type, ui_widget, ui_category, is_active)
VALUES
  ('hr_recruitment.weight_sanctioned_gap',      '14.29'::jsonb, 'Composite score weight for sanctioned-vs-actual input',           'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_sfr',                 '14.29'::jsonb, 'Composite score weight for student-faculty ratio input',           'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_specialization_gap',  '14.29'::jsonb, 'Composite score weight for specialization coverage input',         'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_workload',            '14.29'::jsonb, 'Composite score weight for faculty workload input',                'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_projected_intake',    '14.29'::jsonb, 'Composite score weight for projected next-AY intake input',        'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_attrition_pipeline',  '14.29'::jsonb, 'Composite score weight for attrition pipeline input',              'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.weight_peer_benchmark',      '14.27'::jsonb, 'Composite score weight for peer comparison (adjusted to sum 100)', 'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.leave_exclusion_threshold_days', '30'::jsonb, 'Exclude faculty from headcount if on leave > this many days',     'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.retirement_age_default',     '60'::jsonb,    'Default retirement age for attrition projection',                  'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.cache_ttl_seconds',          '3600'::jsonb,  'Signal cache duration in seconds (1 hour default)',                'global', 'number', 'number', 'hr_recruitment', true),
  ('hr_recruitment.signal_granularity',         '"program"'::jsonb, 'per-program or per-department (configurable per institution)', 'global', 'string', 'dropdown', 'hr_recruitment', true)
ON CONFLICT DO NOTHING;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-recruitment-escalation-docs', 'hr-recruitment-escalation-docs', false) ON CONFLICT (id) DO NOTHING;

-- updated_at triggers
DO $$ DECLARE tbl text; BEGIN FOR tbl IN SELECT unnest(ARRAY['hr_recruitment_signal_inputs','hr_recruitment_signal_cache','hr_recruitment_signal_suppressions','hr_recruitment_escalations','hr_faculty_workload']) LOOP EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I; CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();', tbl, tbl, tbl, tbl); END LOOP; END $$;

-- Verification
DO $$ DECLARE v_inputs int; v_policies int; v_tables int; BEGIN
  SELECT count(*) INTO v_inputs FROM public.hr_recruitment_signal_inputs;
  SELECT count(*) INTO v_policies FROM public.platform_policies WHERE policy_key LIKE 'hr_recruitment.%';
  SELECT count(*) INTO v_tables FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('hr_recruitment_signal_inputs','hr_recruitment_signal_cache','hr_recruitment_signal_suppressions','hr_recruitment_escalations','hr_recruitment_user_visits','hr_recruitment_signal_snapshots','hr_faculty_workload');
  RAISE NOTICE 'PR2 verified: % inputs, % policies, %/7 tables', v_inputs, v_policies, v_tables;
  IF v_inputs < 7 THEN RAISE EXCEPTION 'Expected 7 inputs, got %', v_inputs; END IF;
  IF v_tables < 7 THEN RAISE EXCEPTION 'Expected 7 tables, got %', v_tables; END IF;
END $$;

COMMIT;
