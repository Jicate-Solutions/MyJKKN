-- Work Pulse: Migration 3 — wp_micro_interviews + wp_agent_impact
-- Targeted questions and post-deployment measurement
-- Created: 2026-03-30
-- Depends on: 20260330000002_wp_patterns.sql (FK to wp_patterns)

-- Micro-interviews table
CREATE TABLE IF NOT EXISTS public.wp_micro_interviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL,
  user_id uuid NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  selected_option text,
  free_text text,
  sent_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT wp_micro_interviews_pkey PRIMARY KEY (id),
  CONSTRAINT wp_micro_interviews_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.wp_patterns(id) ON DELETE CASCADE,
  CONSTRAINT wp_micro_interviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.wp_micro_interviews IS 'Targeted contextual questions sent to affected users';

-- Enable RLS
ALTER TABLE public.wp_micro_interviews ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY wp_micro_select_own ON public.wp_micro_interviews
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY wp_micro_update_own ON public.wp_micro_interviews
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY wp_micro_service_write ON public.wp_micro_interviews
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_micro_user
  ON public.wp_micro_interviews (user_id, responded_at);

CREATE INDEX IF NOT EXISTS idx_wp_micro_pattern
  ON public.wp_micro_interviews (pattern_id);

-- Agent Impact table
CREATE TABLE IF NOT EXISTS public.wp_agent_impact (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL,
  agent_name text NOT NULL,
  solution_type public.wp_solution_type NOT NULL,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  pre_hours_weekly numeric(10,2) DEFAULT 0,
  post_hours_weekly numeric(10,2) DEFAULT 0,
  hours_saved_weekly numeric(10,2) GENERATED ALWAYS AS (pre_hours_weekly - post_hours_weekly) STORED,
  people_using integer DEFAULT 0,
  is_jicate_product boolean DEFAULT false,
  last_measured_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT wp_agent_impact_pkey PRIMARY KEY (id),
  CONSTRAINT wp_agent_impact_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.wp_patterns(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.wp_agent_impact IS 'Post-deployment measurement of agents/solutions';
COMMENT ON COLUMN public.wp_agent_impact.hours_saved_weekly IS 'Auto-computed: pre_hours_weekly - post_hours_weekly';

-- Enable RLS
ALTER TABLE public.wp_agent_impact ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY wp_impact_read_all ON public.wp_agent_impact
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY wp_impact_admin_write ON public.wp_agent_impact
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_wp_impact_pattern
  ON public.wp_agent_impact (pattern_id);
