-- ============================================================================
-- Attendance — configurable campus networks (multi-IP, subnet-aware)
-- Date: 2026-07-22 · Spec §14. Replaces the single p_campus_ip param on the
-- reconciliation engine with an admin-editable config table so campus IPs can
-- change / multiply without a code deploy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_campus_networks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr       cidr NOT NULL,                 -- single IP (/32) or a range (e.g. 10.10.0.0/16)
  label      text NOT NULL,                 -- human label, e.g. 'Main Block gateway'
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_campus_networks_cidr_uniq UNIQUE (cidr)
);
COMMENT ON TABLE public.attendance_campus_networks IS
  'Admin-editable list of campus network ranges (CIDR). The attendance reconciliation engine treats platform activity from any active range as on-campus. Spec 2026-07-22 §14.';

ALTER TABLE public.attendance_campus_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acn_select ON public.attendance_campus_networks;
CREATE POLICY acn_select ON public.attendance_campus_networks
  FOR SELECT USING (is_super_admin() OR is_admin());
DROP POLICY IF EXISTS acn_write ON public.attendance_campus_networks;
CREATE POLICY acn_write ON public.attendance_campus_networks
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- Seed the observed candidate INACTIVE — do not trust until IT confirms it.
INSERT INTO public.attendance_campus_networks (cidr, label, is_active)
  VALUES ('163.53.207.162/32', 'CANDIDATE gateway — CONFIRM WITH IT before activating', false)
  ON CONFLICT (cidr) DO NOTHING;

-- Update the engine (same signature as v1 — CREATE OR REPLACE, no drop) to read
-- active campus networks from the config table (subnet-aware, multiple ranges).
-- p_campus_ip is kept as an OPTIONAL override, OR'd with the table.
CREATE OR REPLACE FUNCTION public.fn_att_reconcile_propose(
  p_start        date,
  p_end          date,
  p_campus_ip    inet    DEFAULT NULL,   -- optional extra campus IP; table is the main source
  p_work_start   time    DEFAULT '08:00',
  p_work_end     time    DEFAULT '18:00',
  p_min_actions  integer DEFAULT 3,
  p_realwork_actions text[] DEFAULT ARRAY['attendance','marks','grade','assessment']
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_written integer := 0;
BEGIN
  WITH fac AS (
    SELECT DISTINCT p.id AS profile_id
    FROM public.profiles p
    WHERE p.is_active = true AND p.role IN ('faculty','hod')
  ),
  days AS (
    SELECT d::date AS work_date
    FROM generate_series(p_start, p_end, interval '1 day') d
    WHERE extract(isodow FROM d) < 6
  ),
  gaps AS (
    SELECT f.profile_id, dd.work_date
    FROM fac f CROSS JOIN days dd
    WHERE NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a
      WHERE a.profile_id = f.profile_id AND a.work_date = dd.work_date
        AND a.source = 'biometric' AND a.status_code IN ('PRESENT','HALF_DAY','ON_DUTY')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.faculty_attendance_days a2
      WHERE a2.profile_id = f.profile_id AND a2.work_date = dd.work_date
        AND a2.status_code IN ('LEAVE','HOLIDAY','on_clinical_posting')
    )
  ),
  signal AS (     -- IST dates/times; campus = activity from ANY active configured range
    SELECT g.profile_id, g.work_date,
           count(*) FILTER (WHERE (ual.created_at AT TIME ZONE 'Asia/Kolkata')::time
                                    BETWEEN p_work_start AND p_work_end) AS wh_actions,
           count(DISTINCT ual.ip_address) AS distinct_ips,
           bool_or(
             (p_campus_ip IS NOT NULL AND ual.ip_address = p_campus_ip)
             OR EXISTS (SELECT 1 FROM public.attendance_campus_networks n
                        WHERE n.is_active AND ual.ip_address <<= n.cidr)
           ) AS campus_ip,
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
      WHERE public.faculty_attendance_reconcile_proposals.status = 'pending'
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM ins;
  RETURN v_written;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_att_reconcile_propose(date,date,inet,time,time,integer,text[]) TO service_role;
