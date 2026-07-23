-- ─── Events Platform Promotion · PR1 — Sponsors + preset substrate ───
-- 2026-06-23
-- Promotes the Marathon-trapped sponsorship CRM into the shared events layer so EVERY
-- event type (tournament, lecture, cultural, …) inherits it — not just marathon.
--
-- Strategy (decision #3, "safe-fast"): rename marathon_sponsors(+2 children) → event_sponsors(+children),
-- and leave the OLD names working as security_invoker compat VIEWS during the transition. Data, columns,
-- indexes AND RLS policies ride along with ALTER TABLE … RENAME automatically (metadata-only). Idempotent —
-- safe to run twice. Verified DB-safe by audit: no DB function/RPC references these tables (pg_proc scan empty).
--
-- Also seeds the (empty) event_presets table — substrate for the PR9 preset system (official + personal
-- saved configs of {enabled tools + format + rules + fees + divisions}). UX wired in PR9; created now so
-- later PRs have the table to build against.

-- ── 1. Rename the sponsor tables (idempotent) ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.marathon_sponsors') IS NOT NULL
     AND to_regclass('public.event_sponsors') IS NULL THEN
    -- marathon_sponsors here is still the TABLE (the compat view is created below, only after this).
    EXECUTE 'ALTER TABLE public.marathon_sponsors RENAME TO event_sponsors';
  END IF;

  IF to_regclass('public.marathon_sponsor_deliverables') IS NOT NULL
     AND to_regclass('public.event_sponsor_deliverables') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_sponsor_deliverables RENAME TO event_sponsor_deliverables';
  END IF;

  IF to_regclass('public.marathon_sponsor_activity_log') IS NOT NULL
     AND to_regclass('public.event_sponsor_activity_log') IS NULL THEN
    EXECUTE 'ALTER TABLE public.marathon_sponsor_activity_log RENAME TO event_sponsor_activity_log';
  END IF;
END $$;

-- ── 2. Backward-compat VIEWS at the old names (security_invoker = underlying RLS still applies) ──
-- TEMPORARY: drop in a later cleanup PR after one healthy cycle. They keep any stray raw-SQL /
-- direct PostgREST (/rest/v1/marathon_sponsors) reads working through the cutover.
DO $$
BEGIN
  IF to_regclass('public.event_sponsors') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_sponsors WITH (security_invoker = true) AS SELECT * FROM public.event_sponsors';
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_sponsor_deliverables WITH (security_invoker = true) AS SELECT * FROM public.event_sponsor_deliverables';
    EXECUTE 'CREATE OR REPLACE VIEW public.marathon_sponsor_activity_log WITH (security_invoker = true) AS SELECT * FROM public.event_sponsor_activity_log';
    -- preserve prior read access through the old names
    EXECUTE 'GRANT SELECT ON public.marathon_sponsors, public.marathon_sponsor_deliverables, public.marathon_sponsor_activity_log TO authenticated, anon';
  END IF;
END $$;

-- ── 3. event_presets substrate (empty in PR1; PR9 builds the CRUD UX) ────────
CREATE TABLE IF NOT EXISTS public.event_presets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     text NOT NULL,                       -- 'sports_tournament' | 'marathon' | 'lecture' | …
  name           text NOT NULL,                        -- e.g. "Volleyball", "Chess"
  scope          text NOT NULL DEFAULT 'personal'
                   CHECK (scope IN ('official', 'personal')),
  owner_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  config         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {enabled_tools, format, rules, fees, divisions}
  institution_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_presets_type   ON public.event_presets (event_type);
CREATE INDEX IF NOT EXISTS idx_event_presets_owner  ON public.event_presets (owner_id);

ALTER TABLE public.event_presets ENABLE ROW LEVEL SECURITY;

-- read: official presets are visible to all authenticated users; personal presets only to their owner
DROP POLICY IF EXISTS event_presets_select ON public.event_presets;
CREATE POLICY event_presets_select ON public.event_presets
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR scope = 'official'
    OR owner_id = auth.uid()
  );

-- write personal: owner manages their own copies
DROP POLICY IF EXISTS event_presets_write_personal ON public.event_presets;
CREATE POLICY event_presets_write_personal ON public.event_presets
  FOR ALL TO authenticated
  USING (scope = 'personal' AND owner_id = auth.uid())
  WITH CHECK (scope = 'personal' AND owner_id = auth.uid());

-- write official: admins / holders of events.presets.manage publish standard presets
DROP POLICY IF EXISTS event_presets_write_official ON public.event_presets;
CREATE POLICY event_presets_write_official ON public.event_presets
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin() OR user_has_permission('events.presets.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('events.presets.manage'));

-- anon never touches presets
REVOKE ALL ON public.event_presets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_presets TO authenticated;
