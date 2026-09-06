-- ============================================================================
-- HR Templates Library
-- Provides a reusable document template catalogue for HR processes.
-- Migration: 20260526030000_hr_templates_table.sql
-- ============================================================================

-- ─── Table ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  category    text        NOT NULL CHECK (category IN (
    'interview_questions', 'email_templates', 'process_guides',
    'checklists', 'evaluation_forms', 'policy_templates',
    'report_templates', 'onboarding_docs', 'offboarding_docs'
  )),
  file_url    text,                     -- Supabase Storage path or external URL
  file_type   text        CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'md', 'link')),
  tags        text[]      DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  uploaded_by uuid        REFERENCES public.profiles(id),
  download_count integer  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_templates IS 'HR document template library — reusable templates for recruitment, onboarding, evaluation, and policy processes.';

-- ─── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_hr_templates_category ON public.hr_templates (category);
CREATE INDEX IF NOT EXISTS idx_hr_templates_is_active ON public.hr_templates (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hr_templates_tags ON public.hr_templates USING gin (tags);

-- ─── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.hr_templates ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user
CREATE POLICY hr_templates_select ON public.hr_templates
  FOR SELECT TO authenticated
  USING (true);

-- Insert/Update/Delete: only users with admin-level roles
CREATE POLICY hr_templates_insert ON public.hr_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.system_role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY hr_templates_update ON public.hr_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.system_role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY hr_templates_delete ON public.hr_templates
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.system_role IN ('super_admin', 'admin')
    )
  );

-- ─── Updated-at Trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_hr_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_templates_updated_at
  BEFORE UPDATE ON public.hr_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_templates_updated_at();

-- ─── Seed Templates ────────────────────────────────────────────────────────────

INSERT INTO public.hr_templates (title, description, category, file_type, tags) VALUES
(
  'Faculty Interview Question Bank',
  'Comprehensive question bank covering teaching philosophy, research experience, subject expertise, and classroom management for faculty interviews.',
  'interview_questions', 'pdf',
  ARRAY['faculty', 'interview', 'hiring']
),
(
  'Offer Letter Template',
  'Standard offer letter template with salary structure, joining date, terms & conditions, and document requirements for new faculty hires.',
  'email_templates', 'docx',
  ARRAY['offer', 'hiring', 'letter']
),
(
  'New Faculty Onboarding Guide',
  'Step-by-step onboarding guide covering orientation schedule, IT setup, department introduction, and mentorship assignment.',
  'onboarding_docs', 'pdf',
  ARRAY['onboarding', 'faculty', 'orientation']
),
(
  'Exit Interview Questionnaire',
  'Structured questionnaire for departing staff covering reasons for leaving, workplace satisfaction, and improvement suggestions.',
  'offboarding_docs', 'pdf',
  ARRAY['exit', 'offboarding', 'feedback']
),
(
  'Annual Performance Evaluation Form',
  'Comprehensive evaluation form with sections for teaching effectiveness, research output, administrative duties, and professional development.',
  'evaluation_forms', 'xlsx',
  ARRAY['performance', 'evaluation', 'annual']
),
(
  'Teaching Workload Reporting Guide',
  'Guide for faculty to report weekly contact hours, administrative duties, research time, and co-curricular activities.',
  'process_guides', 'pdf',
  ARRAY['workload', 'reporting', 'faculty']
),
(
  'HR Policy Amendment Template',
  'Template for proposing amendments to existing HR policies with sections for rationale, impact analysis, and stakeholder sign-off.',
  'policy_templates', 'docx',
  ARRAY['policy', 'amendment', 'governance']
),
(
  'Faculty Recruitment Checklist',
  'End-to-end checklist for faculty recruitment: position approval, advertisement, shortlisting, interview panel, demo lecture, offer, and joining.',
  'checklists', 'md',
  ARRAY['recruitment', 'checklist', 'hiring']
)
ON CONFLICT DO NOTHING;
