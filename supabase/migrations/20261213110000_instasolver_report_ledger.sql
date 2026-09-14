-- ============================================================================
-- InstaSolver — the report ledger the rate limits are counted from.
--
-- WHY THIS TABLE EXISTS AT ALL
--
-- The first cut of app/api/instasolver/broken counted `project_tasks` rows to
-- enforce "10 reports per reporter per rolling 24h". That ceiling was not a
-- ceiling. `project_tasks` RLS, written by
-- 20260528000000_pm_projects_foundation.sql:844-849, is:
--
--     CREATE POLICY project_tasks_write ON public.project_tasks FOR ALL
--       USING (auth.uid() IS NOT NULL)
--       WITH CHECK (auth.uid() IS NOT NULL);
--
-- FOR ALL, gated on nothing but "is signed in". Any authenticated learner can
-- DELETE those rows straight through PostgREST with their own JWT — not merely
-- their own rows, any row — and then file ten more. A limit counted from state
-- the limited party can delete is decoration. It was also an unindexed
-- `count: 'exact'` over a jsonb predicate (`metadata->>source`, no GIN on
-- `project_tasks.metadata`) that failed OPEN on timeout, so the cost of
-- defeating it fell as the table grew.
--
-- WHY NOT `audit_logs`
--
-- Checked first, as the cheaper option, because it already carries
-- idx_audit_logs_metadata (GIN). Rejected: its RLS
-- (20250930000008_create_audit_trail_table.sql) is
--
--     CREATE POLICY "System can create audit logs" ON audit_logs
--       FOR INSERT WITH CHECK (true);
--
-- and no later migration narrows it. Authenticated INSERT is wide open, so a
-- learner cannot erase their own count but CAN forge rows carrying another
-- person's `user_id` and lock that person out of reporting a hazard. Turning a
-- safety valve into a denial-of-service tool is worse than the hole it closes.
--
-- WHAT THIS TABLE IS THEREFORE SHAPED TO BE
--
-- Append-only from the application's point of view, written ONLY by the
-- service role, readable by nobody through the anon or authenticated keys, and
-- indexed on exactly the two windows that are counted. It holds no report
-- content — no title, no description, no location, no photo path. It is a
-- tally, and a tally is all it can ever leak.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.instasolver_report_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- profiles.id of whoever filed. NOT a foreign key on purpose: if a leaver's
  -- profile is deleted, ON DELETE CASCADE would silently refund their quota,
  -- and ON DELETE RESTRICT would block an unrelated deletion. The tally should
  -- outlive the account either way.
  reporter_id     UUID NOT NULL,
  -- Which college the reporter belonged to at the time. Nullable because
  -- profiles.institution_id is nullable.
  institution_id  UUID,
  -- TRUE when this report was allowed to send an urgent WhatsApp page. The
  -- per-institution page cap counts these, so it must be recorded whether or
  -- not the send later succeeded — a cap that only counted successes could be
  -- walked past by causing failures.
  paged           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.instasolver_report_ledger IS
  'Append-only tally of InstaSolver "something is broken" reports. Service-role writes only; the two rate limits in app/api/instasolver/broken are counted from here because project_tasks is deletable by any authenticated user. Carries no report content.';

-- The reporter ceiling: WHERE reporter_id = $1 AND created_at >= $2.
CREATE INDEX IF NOT EXISTS idx_instasolver_ledger_reporter_created
  ON public.instasolver_report_ledger (reporter_id, created_at DESC);

-- The per-institution page cap: WHERE institution_id = $1 AND paged AND
-- created_at >= $2. Partial, because only paged rows are ever counted here.
CREATE INDEX IF NOT EXISTS idx_instasolver_ledger_institution_paged
  ON public.instasolver_report_ledger (institution_id, created_at DESC)
  WHERE paged;

-- ── Lock it ─────────────────────────────────────────────────────────────────
-- RLS on with NO policy for `authenticated` is the whole design: PostgREST
-- reaches this table as `anon` or `authenticated`, both of which are subject to
-- RLS, and a table with RLS enabled and no matching policy denies every row.
-- The service role bypasses RLS, so the route can still write and count. That
-- asymmetry is exactly what `project_tasks` lacked.
ALTER TABLE public.instasolver_report_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.instasolver_report_ledger FROM anon;
REVOKE ALL ON public.instasolver_report_ledger FROM PUBLIC;

-- Deliberately absent: any GRANT to `authenticated`, and any POLICY. Adding
-- either re-opens the hole this table was created to close. If a screen ever
-- needs to show a reporter their own history, add a SECURITY DEFINER function
-- that returns only `auth.uid()`'s rows — do not grant the table.
