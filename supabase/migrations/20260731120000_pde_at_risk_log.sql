-- ============================================================================
-- PDE at-risk flag log — turns the live-computed at-risk surface into a
-- pipeline with history.
--
-- Problem this solves: `/pde/admin/at-risk` reads the VIEW
-- `pde_at_risk_learners` (defined in 20260405200000_add_pde_tables.sql), which
-- recomputes risk on every page load from `pde_engagement_daily`. Because it is
-- a view and nothing persists, two questions are unanswerable today:
--   1. "When was this learner FIRST flagged?"
--   2. "Is this getting better, or have they been flagged for six weeks?"
-- and nobody is ever TOLD that a learner crossed into at-risk.
--
-- This migration adds the durable half: an append-only log written by
-- /api/cron/pde-at-risk-flag (service_role), plus a read-side aggregate view
-- the existing page joins onto so the live view keeps working unchanged.
--
-- MULTI-TENANCY NOTE: neither `pde_engagement_daily` nor the
-- `pde_at_risk_learners` view carries institution_id — PDE tables predate the
-- institution-scoping convention. The cron resolves institution_id from
-- `profiles.institution_id` at flag time and SKIPS learners whose profile has
-- none, rather than writing a NULL that would escape institution scoping.
-- That is why institution_id is NOT NULL here.
--
-- WRITES ARE CRON-ONLY. No INSERT/UPDATE/DELETE policy is granted to
-- `authenticated` on purpose — the cron uses the service-role client, which
-- bypasses RLS. Adding a write policy for `authenticated` would let any holder
-- of the view permission forge flag history.
--
-- Created: 2026-07-21
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pde_at_risk_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Learner reference. Mirrors pde_engagement_daily.learner_id, which is an
  -- auth/profiles id (the view LEFT JOINs profiles p ON e.learner_id = p.id).
  learner_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- The VAC course the worst risk row came from. Nullable because a course can
  -- be deleted without invalidating the history of the flag.
  course_id               UUID REFERENCES vac_courses(id) ON DELETE SET NULL,

  -- Multi-tenant scope. Resolved from profiles.institution_id by the cron.
  institution_id          UUID NOT NULL REFERENCES institutions(id),

  flagged_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- UTC calendar day of the flag. Vercel functions run UTC; this column is the
  -- dedup axis (one flag per learner per UTC day).
  flag_date               DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),

  -- Reason: which band the learner fell into. 'on_track' is deliberately NOT
  -- allowed — an on-track learner is not a flag, and logging one would make
  -- "days flagged" meaningless.
  risk_level              TEXT NOT NULL
                          CHECK (risk_level IN ('critical', 'warning', 'struggling')),

  -- Metric snapshot at flag time, denormalized for the two fields the admin
  -- surface sorts and colours on. Frozen on purpose: the view recomputes, the
  -- log must not drift.
  days_inactive           INTEGER,
  avg_score               NUMERIC,

  -- Everything else observed at flag time (last_active_date, total_time,
  -- total_lessons_completed, how many courses the learner was flagged in, and
  -- the per-course breakdown). JSONB so the cron can widen the snapshot without
  -- a schema change.
  metric_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pde_at_risk_log IS
  'Append-only history of PDE at-risk flags. Written only by /api/cron/pde-at-risk-flag via service_role. One row per learner per UTC day (see pde_at_risk_log_learner_day_uniq).';
COMMENT ON COLUMN pde_at_risk_log.institution_id IS
  'Resolved from profiles.institution_id at flag time; learners without one are skipped by the cron rather than logged unscoped.';
COMMENT ON COLUMN pde_at_risk_log.metric_snapshot IS
  'Frozen metrics at flag time: last_active_date, total_time, total_lessons_completed, courses_flagged, course_ids.';

-- ----------------------------------------------------------------------------
-- 2. UNIQUENESS GUARD + INDEXES
-- ----------------------------------------------------------------------------

-- Dedup axis: the same learner cannot be flagged twice in the same UTC day,
-- however many courses they are struggling in. Both columns are NOT NULL, so
-- there is no NULL-is-distinct hole here. The cron ALSO pre-checks, but this
-- index is what makes concurrent/overlapping runs safe.
CREATE UNIQUE INDEX IF NOT EXISTS pde_at_risk_log_learner_day_uniq
  ON pde_at_risk_log (learner_id, flag_date);

-- History lookup for one learner (first flagged / streak).
CREATE INDEX IF NOT EXISTS pde_at_risk_log_learner_idx
  ON pde_at_risk_log (learner_id, flag_date DESC);

-- Institution-scoped reads (RLS predicate + admin dashboards).
CREATE INDEX IF NOT EXISTS pde_at_risk_log_institution_idx
  ON pde_at_risk_log (institution_id, flag_date DESC);

-- "What did today's run flag?" — the cron's own dedup pre-check.
CREATE INDEX IF NOT EXISTS pde_at_risk_log_flag_date_idx
  ON pde_at_risk_log (flag_date DESC);

-- ----------------------------------------------------------------------------
-- 3. RLS — canonical dynamic-permission pattern (supabase/setup/03_policies.sql)
-- ----------------------------------------------------------------------------

ALTER TABLE pde_at_risk_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pde_at_risk_log_select_by_role" ON pde_at_risk_log;
CREATE POLICY "pde_at_risk_log_select_by_role" ON pde_at_risk_log
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('pde.admin.at_risk.view')
      AND role_has_institution_access(institution_id)
    )
  );

-- No INSERT / UPDATE / DELETE policies. Writes are service_role only (cron).
-- See header note.

-- ----------------------------------------------------------------------------
-- 4. READ-SIDE AGGREGATE VIEW
-- ----------------------------------------------------------------------------
-- Answers "first flagged when?" and "flagged how long?" in one row per learner.
--
-- security_invoker = true so the view is filtered by the querying user's own
-- RLS on pde_at_risk_log above. WITHOUT this, a view runs as its owner and
-- would leak every institution's flag history to any authenticated caller.

DROP VIEW IF EXISTS pde_at_risk_history;
CREATE VIEW pde_at_risk_history
WITH (security_invoker = true) AS
SELECT
  l.learner_id,
  l.institution_id,
  MIN(l.flagged_at)                                       AS first_flagged_at,
  MAX(l.flagged_at)                                       AS last_flagged_at,
  MIN(l.flag_date)                                        AS first_flag_date,
  MAX(l.flag_date)                                        AS last_flag_date,
  COUNT(*)::INTEGER                                       AS flag_count,
  -- Calendar span from the first flag to today. "Days flagged" in the sense the
  -- admin asks it: how long has this learner been a problem, not how many runs
  -- happened to fire.
  (CURRENT_DATE - MIN(l.flag_date))::INTEGER              AS days_since_first_flag,
  -- Whether the learner is still being flagged as of the most recent UTC day.
  (MAX(l.flag_date) >= ((now() AT TIME ZONE 'utc')::date - 1)) AS is_currently_flagged,
  -- Worst band ever recorded, for triage ordering.
  (ARRAY_AGG(l.risk_level ORDER BY
      CASE l.risk_level
        WHEN 'critical'    THEN 0
        WHEN 'warning'     THEN 1
        WHEN 'struggling'  THEN 2
        ELSE 3
      END
   ))[1]                                                  AS worst_risk_level
FROM pde_at_risk_log l
GROUP BY l.learner_id, l.institution_id;

COMMENT ON VIEW pde_at_risk_history IS
  'Per-learner rollup of pde_at_risk_log: first/last flag, flag count, days since first flag. security_invoker so pde_at_risk_log RLS applies to the caller.';

GRANT SELECT ON pde_at_risk_history TO authenticated;

NOTIFY pgrst, 'reload schema';
