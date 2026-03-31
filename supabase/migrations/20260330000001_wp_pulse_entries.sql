-- Work Pulse: Migration 1 — wp_pulse_entries
-- Weekly Pulse responses — 2 questions per user per week
-- Created: 2026-03-30

CREATE TABLE IF NOT EXISTS public.wp_pulse_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  department_id uuid,
  role text NOT NULL,
  week_of date NOT NULL,
  talent_waste_category text NOT NULL,
  talent_waste_description text NOT NULL,
  talent_waste_description_en text,
  repetition_category text NOT NULL,
  repetition_description text NOT NULL,
  repetition_description_en text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT wp_pulse_entries_pkey PRIMARY KEY (id),
  CONSTRAINT wp_pulse_entries_user_id_week_of_key UNIQUE (user_id, week_of),
  CONSTRAINT wp_pulse_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT wp_pulse_entries_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id),
  CONSTRAINT wp_pulse_entries_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id),
  CONSTRAINT wp_pulse_entries_talent_desc_min CHECK (char_length(talent_waste_description) >= 10),
  CONSTRAINT wp_pulse_entries_repetition_desc_min CHECK (char_length(repetition_description) >= 10)
);

COMMENT ON TABLE public.wp_pulse_entries IS 'Weekly Pulse responses — 2 questions per user per week';
COMMENT ON COLUMN public.wp_pulse_entries.week_of IS 'Monday of the ISO week';
COMMENT ON COLUMN public.wp_pulse_entries.talent_waste_description_en IS 'English translation when Tamil input detected';
COMMENT ON COLUMN public.wp_pulse_entries.repetition_description_en IS 'English translation when Tamil input detected';

-- Enable RLS
ALTER TABLE public.wp_pulse_entries ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY wp_pulse_entries_insert_own ON public.wp_pulse_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY wp_pulse_entries_select_own ON public.wp_pulse_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY wp_pulse_entries_update_own ON public.wp_pulse_entries
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_pulse_user_week
  ON public.wp_pulse_entries (user_id, week_of DESC);

CREATE INDEX IF NOT EXISTS idx_wp_pulse_institution_week
  ON public.wp_pulse_entries (institution_id, week_of DESC);

CREATE INDEX IF NOT EXISTS idx_wp_pulse_talent_category
  ON public.wp_pulse_entries (talent_waste_category);

CREATE INDEX IF NOT EXISTS idx_wp_pulse_repetition_category
  ON public.wp_pulse_entries (repetition_category);
