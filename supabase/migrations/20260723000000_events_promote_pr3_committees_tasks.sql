-- ─── Events Platform Promotion · PR3 — Committees + Tasks (external-by-name members) ───
-- 2026-06-23
-- Promotes the Marathon committees + prep-task checklist into the shared events layer. Decision #8:
-- committees may include external (non-JKKN) people added by name/phone (guest referees, parent helpers).
--
-- The schema already supports name-based members (member_names[] / lead_name) and name-based task
-- assignees (assigned_to_name). PR3 adds one external_members JSONB column ([{name, phone}]) so guest
-- members can carry a phone. Renames mirror PR1/PR2: idempotent, security_invoker compat views, RLS rides along.

-- ── 1. Rename committees + tasks (FK tasks.committee_id is by table identity, unaffected by rename) ──
DO $$
BEGIN
  IF to_regclass('public.marathon_committees') IS NOT NULL
     AND to_regclass('public.event_committees') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_committees RENAME TO event_committees';
  END IF;
  IF to_regclass('public.marathon_tasks') IS NOT NULL
     AND to_regclass('public.event_tasks') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_tasks RENAME TO event_tasks';
  END IF;
END $$;

-- ── 2. external_members for guest (non-JKKN) committee members with a phone ──
ALTER TABLE public.event_committees
  ADD COLUMN IF NOT EXISTS external_members jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 3. Backward-compat views at the old names ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.event_committees') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_committees WITH (security_invoker = true) AS SELECT * FROM public.event_committees';
    EXECUTE 'GRANT SELECT ON public.marathon_committees TO authenticated, anon';
  END IF;
  IF to_regclass('public.event_tasks') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_tasks WITH (security_invoker = true) AS SELECT * FROM public.event_tasks';
    EXECUTE 'GRANT SELECT ON public.marathon_tasks TO authenticated, anon';
  END IF;
END $$;
