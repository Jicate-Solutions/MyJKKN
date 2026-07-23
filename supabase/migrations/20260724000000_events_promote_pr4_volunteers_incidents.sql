-- ─── Events Platform Promotion · PR4 — Volunteers + Incidents (external-by-name volunteers) ───
-- 2026-06-23
-- Promotes the Marathon volunteer check-in roster + incident log into the shared events layer so ANY
-- event type (tournament, marathon, …) can staff stations and log/resolve incidents. Decision #8:
-- volunteers may be external (non-JKKN) people added by name/phone (guest helpers, parent marshals).
--
-- The volunteer roster is ALREADY name-based (volunteer_name / volunteer_phone — no user FK), so guest
-- volunteers work today. PR4 adds explicit external_name / external_phone markers so a guest volunteer is
-- distinguishable from a staff/student one in the UI and in reports. Renames mirror PR1/PR2/PR3:
-- idempotent, security_invoker compat views at the old names, RLS rides along with the table identity.
--
-- The nullable race-day fields (event_volunteer_checkins.checkpoint_id, event_incidents.bib_number) ride
-- along harmlessly — they stay nullable and are simply unused by non-marathon event types.

-- ── 1. Rename volunteer check-ins + incidents (table identity preserved → RLS/indexes/FKs unaffected) ──
DO $$
BEGIN
  IF to_regclass('public.marathon_volunteer_checkins') IS NOT NULL
     AND to_regclass('public.event_volunteer_checkins') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_volunteer_checkins RENAME TO event_volunteer_checkins';
  END IF;
  IF to_regclass('public.marathon_incidents') IS NOT NULL
     AND to_regclass('public.event_incidents') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_incidents RENAME TO event_incidents';
  END IF;
END $$;

-- ── 2. external_name / external_phone for guest (non-JKKN) volunteers — decision #8 ──
ALTER TABLE public.event_volunteer_checkins
  ADD COLUMN IF NOT EXISTS external_name  text,
  ADD COLUMN IF NOT EXISTS external_phone text;

-- ── 3. Backward-compat views at the old names (so live marathon reads keep working) ──
DO $$
BEGIN
  IF to_regclass('public.event_volunteer_checkins') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_volunteer_checkins WITH (security_invoker = true) AS SELECT * FROM public.event_volunteer_checkins';
    EXECUTE 'GRANT SELECT ON public.marathon_volunteer_checkins TO authenticated, anon';
  END IF;
  IF to_regclass('public.event_incidents') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_incidents WITH (security_invoker = true) AS SELECT * FROM public.event_incidents';
    EXECUTE 'GRANT SELECT ON public.marathon_incidents TO authenticated, anon';
  END IF;
END $$;
