-- Paradigm Shift Snapshots: Month-over-month tier change tracking
-- Stores monthly snapshots of department tier/score for trend comparison

CREATE TABLE IF NOT EXISTS public.sh_paradigm_shift_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id uuid NOT NULL REFERENCES public.departments(id),
  snapshot_month text NOT NULL, -- 'YYYY-MM' format
  tier text NOT NULL,
  composite_score numeric DEFAULT 0,
  active_metrics_count integer DEFAULT 0,
  metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(department_id, snapshot_month)
);

-- Enable RLS
ALTER TABLE public.sh_paradigm_shift_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read snapshots" ON public.sh_paradigm_shift_snapshots
  FOR SELECT TO authenticated USING (true);

-- Allow service role to insert
CREATE POLICY "Service role can insert snapshots" ON public.sh_paradigm_shift_snapshots
  FOR INSERT TO service_role WITH CHECK (true);
