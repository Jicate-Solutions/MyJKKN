-- ============================================================================
-- Updated: 2026-07-31 — nightly all-history attendance rollup for the Cluster
-- Academic Council dashboard.
--
-- ── THE PROBLEM ────────────────────────────────────────────────────────────
--
-- fn_cac_measured_metrics computes attendance by expanding JSONB per row:
--   student_attendance
--     CROSS JOIN LATERAL jsonb_each(attendance_data)
--     CROSS JOIN LATERAL jsonb_array_elements(period -> 'students')
-- Cost scales with the number of MARKS, not the number of rows. Measured on
-- production 2026-07-31: 1,121,890 marks across 10 institutions, spanning
-- 2025-06-02 .. 2026-07-31, ~4s warm as `postgres`.
--
-- The `authenticated` role carries an 8s statement_timeout, and this query is
-- one of several the CAC page runs. That is why the dashboard shows a labelled
-- trailing window instead of the real all-history rate: not a design choice,
-- a timeout dodge. The label is honest, but the number is not the number the
-- Council actually wants.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- Compute it once a night as `postgres`, where there is no 8s ceiling, and
-- store one row per institution. A page read then costs a 10-row seq scan.
--
-- This migration deliberately does NOT repoint fn_cac_measured_metrics at the
-- rollup. Pointing a live dashboard at a table that has never been populated
-- is how a metric silently becomes zero, and the second locked CAC decision is
-- that a metric must never render a bare zero. The rewire is a follow-up, once
-- these numbers have been compared against a manual all-history computation.
-- Until then the rollup is additive and inert: nothing reads it.
--
-- ── WHY NOT A vercel.json CRON ─────────────────────────────────────────────
--
-- `crons` in vercel.json is at 100 entries, which is the plan cap. A 101st
-- fails the BUILD for every deploy, not just this feature. This registers an
-- ai_routine_schedules row instead and is fired by the existing 15-minute
-- dispatcher, the same contract as learner-risk-staff-notifications.
--
-- ── ANON ───────────────────────────────────────────────────────────────────
--
-- The new table gets an explicit anon revoke. Supabase's
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` hands `anon` a
-- direct grant on every new relation, separate from PUBLIC, so revoking PUBLIC
-- alone is a silent no-op. This is the 2026-06-06 standing rule in CLAUDE.md
-- and the exact mechanism behind the 31 views revoked earlier tonight.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- ── The rollup table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cac_attendance_rollup (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL UNIQUE
                    REFERENCES public.institutions(id) ON DELETE CASCADE,
  marks           bigint NOT NULL DEFAULT 0,
  present         bigint NOT NULL DEFAULT 0,
  presence_rate   numeric(5,2),
  sessions        bigint NOT NULL DEFAULT 0,
  earliest_date   date,
  latest_date     date,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cac_attendance_rollup IS
  'All-history attendance totals per institution, recomputed nightly. Exists because the live JSONB expansion costs ~4s as postgres over 1.12M marks and the authenticated role has an 8s statement_timeout. One row per institution.';
COMMENT ON COLUMN public.cac_attendance_rollup.marks IS
  'Total attendance marks across all history — one per learner per period, NOT one per session.';
COMMENT ON COLUMN public.cac_attendance_rollup.sessions IS
  'Total student_attendance rows. Kept alongside marks so a high rate off three sessions cannot be mistaken for a high rate off three thousand.';

ALTER TABLE public.cac_attendance_rollup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cac_attendance_rollup_select ON public.cac_attendance_rollup;
CREATE POLICY cac_attendance_rollup_select ON public.cac_attendance_rollup
FOR SELECT USING (
      COALESCE(public.is_super_admin(), false)
   OR COALESCE(public.is_admin(), false)
   OR (
        COALESCE(public.user_has_permission('accreditation.cac.view'), false)
        AND COALESCE(public.role_has_institution_access(institution_id), false)
      )
);

-- `authenticated` is revoked too, then re-granted SELECT only. Supabase's
-- ALTER DEFAULT PRIVILEGES grants ALL to `authenticated` at CREATE TABLE time,
-- so a bare `GRANT SELECT TO authenticated` adds nothing and silently leaves
-- INSERT/UPDATE/DELETE in place. Verified in a BEGIN..ROLLBACK rehearsal: the
-- ACL read `authenticated=arwdDxt` — the full set — after the grant. RLS with
-- no write policy denies those today, but a future policy written for reads
-- would quietly enable writes as well. Revoke first, then grant what is meant.
REVOKE ALL ON public.cac_attendance_rollup FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON public.cac_attendance_rollup TO authenticated;
GRANT  ALL    ON public.cac_attendance_rollup TO service_role;

-- ── The refresh ────────────────────────────────────────────────────────────
--
-- Takes NO caller-supplied identity argument: the guard reads the session, so
-- there is nothing to spoof. Both guard predicates are COALESCE-wrapped — a
-- NULL guard falls through to the else-branch and grants access, which is
-- exactly how an anonymous write path stayed open elsewhere in this codebase.

CREATE OR REPLACE FUNCTION public.fn_cac_refresh_attendance_rollup()
RETURNS TABLE (institutions_updated integer, total_marks bigint, elapsed_ms integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_rows    integer;
  v_marks   bigint;
BEGIN
  IF NOT (
       COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
  ) THEN
    RAISE EXCEPTION 'Not authorised to refresh the CAC attendance rollup'
      USING ERRCODE = '42501';
  END IF;

  WITH marks AS (
    SELECT sa.institution_id AS inst,
           count(*)                                            AS marks,
           count(*) FILTER (WHERE entry->>'status' = 'Present') AS present,
           min(sa.attendance_date)                             AS earliest,
           max(sa.attendance_date)                             AS latest
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS period(pkey, pval)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.pval -> 'students') = 'array'
           THEN period.pval -> 'students'
           ELSE '[]'::jsonb END
    ) AS entry
    WHERE sa.institution_id IS NOT NULL
    GROUP BY sa.institution_id
  ),
  sess AS (
    SELECT sa.institution_id AS inst, count(*) AS sessions
    FROM public.student_attendance sa
    WHERE sa.institution_id IS NOT NULL
    GROUP BY sa.institution_id
  ),
  upserted AS (
    INSERT INTO public.cac_attendance_rollup AS r
      (institution_id, marks, present, presence_rate, sessions,
       earliest_date, latest_date, computed_at, updated_at)
    SELECT m.inst,
           m.marks,
           m.present,
           round(100.0 * m.present / NULLIF(m.marks, 0), 2),
           COALESCE(s.sessions, 0),
           m.earliest,
           m.latest,
           now(),
           now()
    FROM marks m
    LEFT JOIN sess s ON s.inst = m.inst
    ON CONFLICT (institution_id) DO UPDATE SET
      marks         = EXCLUDED.marks,
      present       = EXCLUDED.present,
      presence_rate = EXCLUDED.presence_rate,
      sessions      = EXCLUDED.sessions,
      earliest_date = EXCLUDED.earliest_date,
      latest_date   = EXCLUDED.latest_date,
      computed_at   = EXCLUDED.computed_at,
      updated_at    = now()
    RETURNING r.marks
  )
  SELECT count(*)::integer, COALESCE(sum(u.marks), 0)::bigint
    INTO v_rows, v_marks
  FROM upserted u;

  RETURN QUERY SELECT
    v_rows,
    v_marks,
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer;
END;
$$;

COMMENT ON FUNCTION public.fn_cac_refresh_attendance_rollup() IS
  'Recomputes cac_attendance_rollup across ALL history. Admin-guarded, no caller-supplied identity. Called nightly by /api/cron/cac-attendance-rollup under the service-role client.';

REVOKE EXECUTE ON FUNCTION public.fn_cac_refresh_attendance_rollup() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cac_refresh_attendance_rollup() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_cac_refresh_attendance_rollup() TO service_role;

-- ── Dispatcher row — daily 02:40 IST (minute_of_day 160) ───────────────────
-- Off-peak deliberately: the recompute is the heaviest read in the module.

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed, max_only)
VALUES
  ('cac-attendance-rollup', true, ARRAY[0,1,2,3,4,5,6]::smallint[], 160, true, false)
ON CONFLICT (routine_id) DO NOTHING;

COMMIT;
