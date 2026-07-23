-- ============================================================================
-- Smart Guide — adoption layer: guide_progress + guide_events
-- ============================================================================
-- Date: 2026-06-13. Turns the Campus Living guide (PR #1378) into a measured
-- activation checklist: per-user checkable steps + the event funnel that
-- answers "do guide users adopt more?". Both tables RLS-locked to the owner.
-- Generic across modules (persona/surface are free text) so a future module
-- guide reuses the same two tables.
--
-- Reached only by the guide's server actions (lib/campus-living/guide/
-- actions.ts), which also validate name/surface/persona against runtime
-- allow-lists before insert. Fail-soft everywhere — a progress hiccup never
-- blocks the guide.
-- Applied via exec_sql after show-SQL-first (Director session).
-- ============================================================================

-- ── Progress: which steps each user completed, per persona lane ─────────────
CREATE TABLE IF NOT EXISTS public.guide_progress (
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  persona      text NOT NULL,
  step_key     text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, persona, step_key)
);

ALTER TABLE public.guide_progress ENABLE ROW LEVEL SECURITY;

-- A user may only see and change their OWN progress rows.
DROP POLICY IF EXISTS guide_progress_own_select ON public.guide_progress;
CREATE POLICY guide_progress_own_select ON public.guide_progress
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS guide_progress_own_insert ON public.guide_progress;
CREATE POLICY guide_progress_own_insert ON public.guide_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS guide_progress_own_delete ON public.guide_progress;
CREATE POLICY guide_progress_own_delete ON public.guide_progress
  FOR DELETE USING (auth.uid() = user_id);

-- ── Events: the adoption funnel ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guide_events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name       text NOT NULL,
  persona    text NOT NULL,
  surface    text NOT NULL,
  step_key   text,
  context    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guide_events ENABLE ROW LEVEL SECURITY;

-- Users may INSERT their own events. Intentionally NO select policy — analytics
-- reads go through the service role (or an admin view), so a user can never
-- read the whole event stream.
DROP POLICY IF EXISTS guide_events_own_insert ON public.guide_events;
CREATE POLICY guide_events_own_insert ON public.guide_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS guide_events_analytics_idx
  ON public.guide_events (name, persona, created_at);

-- Defense in depth: these are owner-scoped (progress) / write-only (events)
-- tables — anon has no business here. RLS already denies anon (auth.uid() is
-- null matches no progress policy), but revoke the default table grant too.
REVOKE ALL ON public.guide_progress FROM anon;
REVOKE ALL ON public.guide_events   FROM anon;
GRANT  SELECT, INSERT, DELETE ON public.guide_progress TO authenticated;
GRANT  INSERT                ON public.guide_events     TO authenticated;

NOTIFY pgrst, 'reload schema';
