-- Work Pulse: Migration 2 — Enum types + wp_patterns
-- AI-discovered automation opportunities
-- Created: 2026-03-30

-- Enum types
DO $$ BEGIN
  CREATE TYPE public.wp_pattern_source AS ENUM ('observer', 'pulse', 'both', 'user_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.wp_solution_type AS ENUM ('new_module', 'standalone_agent', 'process_change', 'training');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.wp_pattern_tier AS ENUM ('S', 'A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.wp_pattern_status AS ENUM ('discovered', 'classified', 'queued', 'building', 'deployed', 'measuring');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patterns table
CREATE TABLE IF NOT EXISTS public.wp_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  source public.wp_pattern_source NOT NULL DEFAULT 'pulse',
  people_affected integer NOT NULL DEFAULT 0,
  roles_affected text[] DEFAULT '{}',
  departments_affected uuid[] DEFAULT '{}',
  hours_wasted_weekly numeric(10,2) DEFAULT 0,
  feasibility_score integer,
  solution_type public.wp_solution_type,
  impact_score numeric(10,2) DEFAULT 0,
  tier public.wp_pattern_tier DEFAULT 'C',
  status public.wp_pattern_status DEFAULT 'discovered',
  jicate_product_candidate boolean DEFAULT false,
  first_detected_at timestamptz DEFAULT now(),
  last_analysis_at timestamptz,
  analysis_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT wp_patterns_pkey PRIMARY KEY (id),
  CONSTRAINT wp_patterns_feasibility_range CHECK (feasibility_score IS NULL OR (feasibility_score >= 1 AND feasibility_score <= 10))
);

COMMENT ON TABLE public.wp_patterns IS 'AI-discovered automation opportunities from Work Pulse analysis';
COMMENT ON COLUMN public.wp_patterns.impact_score IS 'People × Hours × Feasibility / BuildEffort';
COMMENT ON COLUMN public.wp_patterns.tier IS 'S(100+), A(50-99), B(20-49), C(<20)';

-- Enable RLS
ALTER TABLE public.wp_patterns ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can read, admin/service can write
CREATE POLICY wp_patterns_read_all ON public.wp_patterns
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY wp_patterns_admin_write ON public.wp_patterns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY wp_patterns_service_write ON public.wp_patterns
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_patterns_tier_score
  ON public.wp_patterns (tier, impact_score DESC);

CREATE INDEX IF NOT EXISTS idx_wp_patterns_status
  ON public.wp_patterns (status);

CREATE INDEX IF NOT EXISTS idx_wp_patterns_solution
  ON public.wp_patterns (solution_type);
