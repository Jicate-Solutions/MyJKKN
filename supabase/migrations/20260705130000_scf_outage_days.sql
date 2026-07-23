-- 2026-07-05 — Decision #10 (faculty-feedback → exam-eligibility): system-outage exclusion.
-- A super-admin marks a date (optionally scoped to an institution and/or a period slot) as a
-- feedback-app OUTAGE. Marks whose (attendance_date [, institution][, period]) falls in an outage
-- window are excluded from BOTH the present and absent counts in all three confirmed-count fns
-- (fn_scf_effective_attendance / fn_scf_my_confirmed_attendance / fn_scf_faculty_completion),
-- so no learner and no faculty is penalised for a day the feedback system was down. R1 safety valve.

CREATE TABLE IF NOT EXISTS public.scf_outage_days (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_date    date NOT NULL,
  institution_id uuid NULL,              -- NULL = all institutions
  period_id      text NULL,              -- NULL = every period that day
  reason         text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- NULLS NOT DISTINCT so (date, NULL inst, NULL period) is a single logical key, not infinitely many.
CREATE UNIQUE INDEX IF NOT EXISTS ux_scf_outage_days_key
  ON public.scf_outage_days (outage_date, institution_id, period_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS ix_scf_outage_days_date ON public.scf_outage_days (outage_date);

ALTER TABLE public.scf_outage_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scf_outage_days_select ON public.scf_outage_days;
CREATE POLICY scf_outage_days_select ON public.scf_outage_days
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('academic.attendance.dashboard.view')
  );

DROP POLICY IF EXISTS scf_outage_days_write_superadmin ON public.scf_outage_days;
CREATE POLICY scf_outage_days_write_superadmin ON public.scf_outage_days
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ── Super-admin management RPCs (anon-locked per MyJKKN standing rule) ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_scf_mark_outage_day(
  p_date date, p_institution_id uuid DEFAULT NULL, p_period_id text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_mark_outage_day: not authenticated'; END IF;
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'fn_scf_mark_outage_day: super admin only'; END IF;
  UPDATE public.scf_outage_days
     SET reason = p_reason, updated_at = now(), created_by = auth.uid()
   WHERE outage_date = p_date
     AND institution_id IS NOT DISTINCT FROM p_institution_id
     AND period_id      IS NOT DISTINCT FROM p_period_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.scf_outage_days(outage_date, institution_id, period_id, reason, created_by)
    VALUES (p_date, p_institution_id, p_period_id, p_reason, auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_remove_outage_day(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_remove_outage_day: not authenticated'; END IF;
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'fn_scf_remove_outage_day: super admin only'; END IF;
  DELETE FROM public.scf_outage_days WHERE id = p_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_scf_list_outage_days(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(id uuid, outage_date date, institution_id uuid, period_id text, reason text, created_by uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_list_outage_days: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_list_outage_days: not authorized';
  END IF;
  RETURN QUERY
    SELECT o.id, o.outage_date, o.institution_id, o.period_id, o.reason, o.created_by, o.created_at
    FROM public.scf_outage_days o
    WHERE (p_from IS NULL OR o.outage_date >= p_from)
      AND (p_to   IS NULL OR o.outage_date <= p_to)
    ORDER BY o.outage_date DESC, o.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_mark_outage_day(date, uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_mark_outage_day(date, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_remove_outage_day(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_remove_outage_day(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_scf_list_outage_days(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_list_outage_days(date, date) TO authenticated;
