-- ============================================================================
-- Weekly intake-readiness alarm — four numbers per college to its Principal
-- File: 20260825020000_intake_readiness_weekly_alarm.sql
-- Date: 2026-08-13
--
-- ⚠️ FILE ONLY — NOT APPLIED. Applying this to production is Director-gated.
-- Until it is applied, the /api/cron/intake-readiness-alarm route exists but
-- (a) the dispatcher never fires it (no ai_routine_schedules row) and (b) a
-- manual run fails loudly on the missing RPC. Nothing fires half-configured.
--
-- WHY (Director, rank 9 of the 2026-08-11 invisible-learners audit):
--   "Every problem in this report was found because the Director asked a
--   question. The system had held the answer for weeks." The fix approved was
--   a weekly automated per-college check of FOUR numbers, sent to that
--   college's Principal; any number above zero for 2 CONSECUTIVE weeks
--   additionally escalates to the Director. Example from the audit:
--   Engineering, week of 11 Aug: 208 admitted learners not yet visible ·
--   94 unplaced · B.Pharm has an intake of 93 and zero timetabled class
--   groups · 12 learners admitted 7+ days ago with no bill.
--
-- THE FOUR NUMBERS (current admission year = admission_years.is_current,
-- which is one-per-institution), per active institution:
--   1. paid_not_activated       — learners_profiles rows in lifecycle_status
--                                 'reserved' or 'admitted' (the fee ladder's
--                                 paid-but-not-activated rungs). These
--                                 learners are invisible to attendance today.
--                                 Same predicate as the audit's headline
--                                 metric (baseline 919 on 2026-08-11).
--   2. unplaced_learners        — current-year learners at/beyond 'admitted'
--                                 ('admitted' or 'active') with no class
--                                 group (section_id IS NULL).
--   3. programmes_without_timetable
--                               — programmes with a current-year cohort on
--                                 the books (>= 1 learner in 'reserved',
--                                 'admitted' or 'active') where ZERO of the
--                                 programme's class groups (sections with
--                                 s.program_id = the programme) have any
--                                 timetables row. A group is "timetabled"
--                                 only if a timetable exists for it — the
--                                 same rule as fn_attendance_fresher_readiness
--                                 'blocked'. "Intake > 0" is measured from
--                                 the learners actually on the books, NOT
--                                 programs.sanctioned_intake (often 0/stale).
--   4. admitted_no_bill         — current-year learners at/beyond 'admitted'
--                                 whose profile has existed 7+ days with NO
--                                 billing_student_bills row of any kind
--                                 (deliberately no status filter — "no bill
--                                 of any kind", matching the audit's query).
--                                 learners_profiles has NO admitted_at column
--                                 (verified against setup/01_tables.sql), so
--                                 "admitted 7+ days ago" is proxied by
--                                 created_at <= now() - 7 days; for a
--                                 current-year fresher the profile is created
--                                 at application, which precedes admission,
--                                 so the proxy can only over-report, never
--                                 hide a learner.
--   + current_year_total        — ALL current-year learners on the books (any
--                                 lifecycle). Not one of the four alarm
--                                 numbers; it lets the notification say "no
--                                 learners on the books yet" (the audit's
--                                 six-colleges-at-zero finding) instead of a
--                                 misleading all-clear.
--
-- WHO CALLS IT: only /api/cron/intake-readiness-alarm via the service role.
-- The route computes escalation state in TypeScript (prior week read from
-- ai_jobs) and sends notifications via the existing deliverInApp service.
-- Hence service_role-only: authenticated is explicitly revoked too, because
-- Supabase's default privileges grant EXECUTE to authenticated as well as
-- anon (see 20260808 memory feedback_supabase_default_grant_also_hits_
-- authenticated).
--
-- PL/pgSQL traps avoided by construction:
--   * every RETURNS TABLE column is prefixed/named so no output name is also
--     a column name referenced bare in the body (42702);
--   * institutions.name is varchar(255) — cast ::text explicitly, or the
--     whole result set is discarded at runtime with 42804.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_intake_readiness_weekly_alarm()
RETURNS TABLE(
  alarm_institution_id uuid,
  alarm_institution_name text,
  paid_not_activated bigint,
  unplaced_learners bigint,
  programmes_without_timetable bigint,
  admitted_no_bill bigint,
  current_year_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  WITH cy AS (
    SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true
  ),
  cyl AS (
    -- Current-admission-year learners, once. is_current is one-per-institution
    -- (admission_years_one_current_per_institution), so the IN-set means "each
    -- college's own newest batch" — same shape fn_attendance_fresher_readiness
    -- documents and uses.
    SELECT lp.id, lp.institution_id, lp.program_id, lp.section_id,
           lp.lifecycle_status, lp.created_at
    FROM public.learners_profiles lp
    WHERE lp.admission_year_id IN (SELECT c.id FROM cy c)
      AND lp.institution_id IS NOT NULL
  ),
  m1 AS (
    SELECT c.institution_id AS inst_id, count(*)::bigint AS n
    FROM cyl c
    WHERE c.lifecycle_status IN ('reserved', 'admitted')
    GROUP BY 1
  ),
  m2 AS (
    SELECT c.institution_id AS inst_id, count(*)::bigint AS n
    FROM cyl c
    WHERE c.lifecycle_status IN ('admitted', 'active')
      AND c.section_id IS NULL
    GROUP BY 1
  ),
  cohort_programmes AS (
    SELECT c.institution_id AS inst_id, c.program_id AS prog_id
    FROM cyl c
    WHERE c.lifecycle_status IN ('reserved', 'admitted', 'active')
      AND c.program_id IS NOT NULL
    GROUP BY 1, 2
  ),
  m3 AS (
    -- A programme counts when NO section of that programme has any timetable
    -- row — including the case where the programme has no sections at all
    -- (zero groups = zero timetabled groups).
    SELECT cp.inst_id, count(*)::bigint AS n
    FROM cohort_programmes cp
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sections s
      JOIN public.timetables t ON t.section_id = s.id
      WHERE s.program_id = cp.prog_id
    )
    GROUP BY 1
  ),
  m4 AS (
    SELECT c.institution_id AS inst_id, count(*)::bigint AS n
    FROM cyl c
    WHERE c.lifecycle_status IN ('admitted', 'active')
      AND c.created_at <= now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.billing_student_bills b WHERE b.student_id = c.id
      )
    GROUP BY 1
  ),
  tot AS (
    SELECT c.institution_id AS inst_id, count(*)::bigint AS n
    FROM cyl c
    GROUP BY 1
  )
  SELECT
    i.id,
    i.name::text,
    COALESCE(m1.n, 0),
    COALESCE(m2.n, 0),
    COALESCE(m3.n, 0),
    COALESCE(m4.n, 0),
    COALESCE(tot.n, 0)
  FROM public.institutions i
  LEFT JOIN m1  ON m1.inst_id  = i.id
  LEFT JOIN m2  ON m2.inst_id  = i.id
  LEFT JOIN m3  ON m3.inst_id  = i.id
  LEFT JOIN m4  ON m4.inst_id  = i.id
  LEFT JOIN tot ON tot.inst_id = i.id
  WHERE i.is_active = true
  ORDER BY i.name;
$$;

-- Lock down execution. REVOKE FROM PUBLIC alone is NOT sufficient on Supabase:
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon AND to
-- authenticated, each as a DIRECT grant separate from PUBLIC. This function is
-- called only by the cron route holding the service-role key, so authenticated
-- is revoked too.
REVOKE EXECUTE ON FUNCTION public.fn_intake_readiness_weekly_alarm()
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_intake_readiness_weekly_alarm()
  TO service_role;

COMMENT ON FUNCTION public.fn_intake_readiness_weekly_alarm() IS
  'Weekly intake-readiness alarm (Director, 2026-08-11 audit rank 9): the four '
  'per-college numbers for the current admission year — paid-but-not-activated, '
  'unplaced, programmes with a cohort but zero timetabled class groups, and '
  'admitted-7+-days-with-no-bill. service_role only; read by '
  '/api/cron/intake-readiness-alarm.';

-- ── ai_job_types registry row ────────────────────────────────────────────────
-- The route stores each week''s computed numbers as an ai_jobs row (status
-- 'done', written directly by the service role) so the NEXT week''s run can
-- apply the two-consecutive-weeks escalation rule without a new state table.
-- ai_jobs.job_type has a FK to ai_job_types, so the type must exist.
-- enabled=false ON PURPOSE: fn_ai_enqueue rejects disabled types, so no
-- logged-in user can enqueue one of these; the FK is satisfied either way and
-- the service role writes directly. Never claimable by lane workers: rows are
-- inserted already 'done' (the claim index only sees status='pending').
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled)
VALUES
  ('intake_readiness.weekly_alarm',
   'Intake readiness — weekly alarm state',
   'Weekly per-college intake-readiness numbers recorded by /api/cron/intake-readiness-alarm. Rules-based (no model call); rows exist so the two-consecutive-weeks escalation rule can read the prior week.',
   NULL, 'none', 'job.result',
   false, 'api', 'seat_owner', 1, false, false)
ON CONFLICT (job_type) DO NOTHING;

-- ── dispatcher schedule ──────────────────────────────────────────────────────
-- vercel.json crons are at the hard 100-entry plan cap, so this routine is
-- fired by /api/cron/ai-routine-dispatcher (every 15 min) from this row:
-- Mondays (IST day 1) at 08:45 IST (minute_of_day 525). The route ALSO
-- self-gates on "is it Monday in IST" so an operator flipping days_of_week to
-- daily from /admin/ai-routines cannot silently turn a weekly alarm into a
-- daily one.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('intake-readiness-alarm', true, ARRAY[1]::smallint[], 525, true)
ON CONFLICT (routine_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
