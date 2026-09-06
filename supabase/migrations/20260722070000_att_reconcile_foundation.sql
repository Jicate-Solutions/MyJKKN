-- ============================================================================
-- Biometric <-> Work-Signal Attendance Reconciliation — foundation (v1)
-- Date: 2026-07-22 · Spec: specs/biometric-worksignal-attendance-reconciliation-2026-07-22.md
-- ============================================================================
-- SELF-CONTAINED, keyed by profiles.id (NOT hr_employees — its FK would force
-- activating the payroll employee-master, a separate cutover). Reuses the
-- hr_attendance_status_types vocabulary (PRESENT/ABSENT/REGULARIZED/...) so it
-- can migrate into hr_attendance_records later. INERT UNTIL APPROVED: the engine
-- writes PROPOSALS only; nothing becomes attendance without an HR sign-off.
-- ============================================================================

-- 1. Canonical daily attendance store (one row per faculty per day).
--    source tells origin: 'biometric' (imported punch) | 'work_signal'
--    (reconciled from activity, HR-approved) | 'manual'.
CREATE TABLE IF NOT EXISTS public.faculty_attendance_days (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date     date NOT NULL,
  status_code   text NOT NULL DEFAULT 'PRESENT',   -- mirrors hr_attendance_status_types.code
  source        text NOT NULL DEFAULT 'biometric', -- biometric | work_signal | manual
  in_at         timestamptz,
  out_at        timestamptz,
  hours_worked  numeric,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_by uuid REFERENCES public.profiles(id),
  reconciled_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_attendance_days_uniq UNIQUE (profile_id, work_date)
);
COMMENT ON TABLE public.faculty_attendance_days IS
  'Canonical daily faculty attendance. source=biometric (imported punch) | work_signal (reconciled, HR-approved) | manual. Keyed by profile_id (isolated from hr_employees/payroll). Spec 2026-07-22.';
CREATE INDEX IF NOT EXISTS idx_fad_date ON public.faculty_attendance_days (work_date);

-- 2. Reconciliation proposals — missed-punch days with corroborated work signals,
--    awaiting HR review. Approval writes a work_signal row into #1. Never grants
--    directly.
CREATE TABLE IF NOT EXISTS public.faculty_attendance_reconcile_proposals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  confidence   text NOT NULL CHECK (confidence IN ('high','medium')),  -- 'low'/none never proposed
  evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- action_count, distinct_ips, campus_ip, real_work, first/last action ts
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  uuid REFERENCES public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text,
  cycle_start  date NOT NULL,
  cycle_end    date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farp_uniq UNIQUE (profile_id, work_date)
);
COMMENT ON TABLE public.faculty_attendance_reconcile_proposals IS
  'Proposed attendance grants for missed-punch days that have a corroborated work signal. status pending->approved/rejected by HR. Approval writes faculty_attendance_days(source=work_signal, status=REGULARIZED). Spec 2026-07-22.';
CREATE INDEX IF NOT EXISTS idx_farp_status ON public.faculty_attendance_reconcile_proposals (status, cycle_start);

-- 3. RLS — HR/admins only (this is pay-adjacent). Writes via service_role.
ALTER TABLE public.faculty_attendance_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_attendance_reconcile_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fad_select ON public.faculty_attendance_days;
CREATE POLICY fad_select ON public.faculty_attendance_days
  FOR SELECT USING (is_super_admin() OR is_admin() OR profile_id = auth.uid());
DROP POLICY IF EXISTS farp_select ON public.faculty_attendance_reconcile_proposals;
CREATE POLICY farp_select ON public.faculty_attendance_reconcile_proposals
  FOR SELECT USING (is_super_admin() OR is_admin());

-- 4. Corroboration engine — writes PROPOSALS for missed-punch days that have
--    credible work-signal activity. Reads faculty_attendance_days (biometric) +
--    user_activity_logs + staff. NEVER writes attendance. service_role-only.
--    Config as params: campus IP, working-hours window, min action count.
CREATE OR REPLACE FUNCTION public.fn_att_reconcile_propose(
  p_start        date,
  p_end          date,
  p_campus_ip    inet    DEFAULT NULL,          -- confirmed campus gateway; NULL = campus-IP corroborator off
  p_work_start   time    DEFAULT '08:00',
  p_work_end     time    DEFAULT '18:00',
  p_min_actions  integer DEFAULT 3,             -- min working-hours actions to consider a day "worked"
  p_realwork_actions text[] DEFAULT ARRAY['attendance','marks','grade','assessment']  -- action_type substrings that imply real work
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_written integer := 0;
BEGIN
  WITH fac AS (   -- active faculty/hod, bridged to profile via staff/profiles
    SELECT DISTINCT p.id AS profile_id
    FROM public.profiles p
    WHERE p.is_active = true AND p.role IN ('faculty','hod')
  ),
  days AS (       -- expected working days in window: weekdays not already marked off
    SELECT d::date AS work_date
    FROM generate_series(p_start, p_end, interval '1 day') d
    WHERE extract(isodow FROM d) < 6            -- Mon-Fri (weekend rule; refine w/ holiday calendar later)
  ),
  gaps AS (       -- faculty x working-day with NO biometric present-punch
    SELECT f.profile_id, dd.work_date
    FROM fac f CROSS JOIN days dd
    WHERE NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a
      WHERE a.profile_id = f.profile_id AND a.work_date = dd.work_date
        AND a.source = 'biometric' AND a.status_code IN ('PRESENT','HALF_DAY','ON_DUTY')
    )
    -- and not already on approved leave/holiday (any source marking it off)
    AND NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a2
      WHERE a2.profile_id = f.profile_id AND a2.work_date = dd.work_date
        AND a2.status_code IN ('LEAVE','HOLIDAY','on_clinical_posting')
    )
  ),
  signal AS (     -- working-hours activity metrics per gap day (dates/times in IST)
    SELECT g.profile_id, g.work_date,
           count(*) FILTER (WHERE (ual.created_at AT TIME ZONE 'Asia/Kolkata')::time
                                    BETWEEN p_work_start AND p_work_end) AS wh_actions,
           count(DISTINCT ual.ip_address) AS distinct_ips,
           bool_or(p_campus_ip IS NOT NULL AND ual.ip_address = p_campus_ip) AS campus_ip,
           bool_or(EXISTS (SELECT 1 FROM unnest(p_realwork_actions) rw
                           WHERE ual.action_type ILIKE '%'||rw||'%'
                              OR ual.resource_type ILIKE '%'||rw||'%')) AS real_work,
           min(ual.created_at) AS first_action,
           max(ual.created_at) AS last_action
    FROM gaps g
    JOIN public.user_activity_logs ual
      ON ual.user_id = g.profile_id
     AND (ual.created_at AT TIME ZONE 'Asia/Kolkata')::date = g.work_date
    GROUP BY g.profile_id, g.work_date
  ),
  scored AS (
    SELECT profile_id, work_date, wh_actions, distinct_ips, campus_ip, real_work,
           first_action, last_action,
           CASE
             WHEN wh_actions >= p_min_actions AND (campus_ip OR real_work) THEN 'high'
             WHEN wh_actions >= p_min_actions THEN 'medium'
             ELSE NULL
           END AS confidence
    FROM signal
  ),
  ins AS (
    INSERT INTO public.faculty_attendance_reconcile_proposals
      (profile_id, work_date, confidence, evidence, cycle_start, cycle_end)
    SELECT profile_id, work_date, confidence,
           jsonb_build_object('wh_actions', wh_actions, 'distinct_ips', distinct_ips,
             'campus_ip', campus_ip, 'real_work', real_work,
             'first_action', first_action, 'last_action', last_action),
           p_start, p_end
    FROM scored
    WHERE confidence IS NOT NULL
    ON CONFLICT (profile_id, work_date) DO UPDATE
      SET confidence = EXCLUDED.confidence, evidence = EXCLUDED.evidence,
          cycle_start = EXCLUDED.cycle_start, cycle_end = EXCLUDED.cycle_end
      WHERE public.faculty_attendance_reconcile_proposals.status = 'pending'  -- never overwrite a reviewed one
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM ins;
  RETURN v_written;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) TO service_role;

-- 5. HR review — approve/reject a proposal. On approve, writes the ONLY attendance
--    grant path (source='work_signal', status='REGULARIZED'); NEVER overwrites a
--    real biometric punch. Called by HR under their session; gated to admins.
CREATE OR REPLACE FUNCTION public.fn_att_reconcile_review(
  p_proposal_id uuid, p_action text, p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_prop record; v_uid uuid := auth.uid();
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'bad action'; END IF;
  SELECT * INTO v_prop FROM public.faculty_attendance_reconcile_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_prop.status <> 'pending' THEN RETURN 'already_' || v_prop.status; END IF;

  UPDATE public.faculty_attendance_reconcile_proposals
    SET status = CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,
        reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
    WHERE id = p_proposal_id;

  IF p_action = 'approve' THEN
    INSERT INTO public.faculty_attendance_days
      (profile_id, work_date, status_code, source, evidence, reconciled_by, reconciled_at)
    VALUES (v_prop.profile_id, v_prop.work_date, 'REGULARIZED', 'work_signal',
            v_prop.evidence, v_uid, now())
    ON CONFLICT (profile_id, work_date) DO UPDATE
      SET status_code='REGULARIZED', source='work_signal', evidence=EXCLUDED.evidence,
          reconciled_by=EXCLUDED.reconciled_by, reconciled_at=now(), updated_at=now()
      WHERE public.faculty_attendance_days.source <> 'biometric';   -- never overwrite a real punch
    RETURN 'approved_granted';
  END IF;
  RETURN 'rejected';
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_att_reconcile_review(uuid,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_att_reconcile_review(uuid,text,text) TO authenticated, service_role;
