-- Work Pulse: Migration 4 — RLS fixes + micro-interview monthly limit
-- Security audit patch: drop overly broad department policy, add service_role access
-- Created: 2026-03-30
-- Depends on: Migrations 1-3

-- Drop the department-level SELECT policy (privacy issue: exposed individual entries to HOD)
DROP POLICY IF EXISTS wp_pulse_entries_select_department ON public.wp_pulse_entries;

-- Add service_role policies for AI pipeline access
CREATE POLICY wp_pulse_entries_service_read ON public.wp_pulse_entries
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY wp_pulse_entries_service_update ON public.wp_pulse_entries
  FOR UPDATE USING (auth.role() = 'service_role');

-- Add missing service_role policy on wp_agent_impact
DO $$ BEGIN
  CREATE POLICY wp_impact_service_write ON public.wp_agent_impact
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Monthly interview limit trigger function
CREATE OR REPLACE FUNCTION public.wp_enforce_micro_interview_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wp_micro_interviews
    WHERE user_id = NEW.user_id
      AND date_trunc('month', created_at) = date_trunc('month', now())
  ) THEN
    RAISE EXCEPTION 'User % already has a micro-interview this month', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger
DROP TRIGGER IF EXISTS trg_wp_micro_interview_monthly_limit ON public.wp_micro_interviews;
CREATE TRIGGER trg_wp_micro_interview_monthly_limit
  BEFORE INSERT ON public.wp_micro_interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.wp_enforce_micro_interview_monthly_limit();
