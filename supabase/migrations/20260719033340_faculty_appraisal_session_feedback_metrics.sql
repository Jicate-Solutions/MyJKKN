-- 2026-07-19 - Faculty Appraisal "Metric 12" (student session feedback) wired into the canonical OKR metric registry.
-- DB-only. Extends the existing db_function metric mechanism (fixed 4-arg signature the engine calls:
--   (p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date) RETURNS numeric).
-- Source: public.session_feedback ONLY, joined to profiles via the EMAIL bridge
--   (profiles.id -> profiles.email -> session_feedback.faculty_email, case-insensitive).
--   NOTE: session_feedback.faculty_id does NOT link to profiles.id (0 matches) — email bridge is the only correct link.
-- Min-responses gate = 10 (a window with <10 responses returns NULL = "not enough feedback").
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT + INSERT ... ON CONFLICT DO UPDATE.

-- LEVEL: average "understood" (1..5) for the window; NULL if <10 responses or unknown profile.
CREATE OR REPLACE FUNCTION public.calc_faculty_feedback_understood(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE v_email text; v_n int; v_avg numeric; v_min int := 10;
BEGIN
  SELECT lower(email) INTO v_email FROM public.profiles WHERE id = p_profile_id;
  IF v_email IS NULL THEN RETURN NULL; END IF;
  SELECT count(*), avg(understood::numeric) INTO v_n, v_avg
  FROM public.session_feedback sf
  WHERE lower(sf.faculty_email) = v_email
    AND (p_start_date IS NULL OR sf.attendance_date >= p_start_date)
    AND (p_end_date   IS NULL OR sf.attendance_date <= p_end_date);
  IF v_n < v_min THEN RETURN NULL; END IF;
  RETURN round(v_avg, 3);
END; $$;

-- IMPROVEMENT: (avg understood this window) minus (avg understood in the equal-length window immediately before).
-- NULL if window is unbounded, profile unknown, or EITHER window has <10 responses.
-- Raw (unrounded) averages subtracted, then rounded.
CREATE OR REPLACE FUNCTION public.calc_faculty_feedback_improvement(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE v_email text; v_len int; v_ps date; v_pe date;
        v_cn int; v_ca numeric; v_pn int; v_pa numeric; v_min int := 10;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RETURN NULL; END IF;
  SELECT lower(email) INTO v_email FROM public.profiles WHERE id = p_profile_id;
  IF v_email IS NULL THEN RETURN NULL; END IF;
  v_len := (p_end_date - p_start_date);        -- day span; inclusive length = v_len+1
  v_pe  := p_start_date - 1;
  v_ps  := v_pe - v_len;                        -- equal-length window immediately before
  SELECT count(*), avg(understood::numeric) INTO v_cn, v_ca
    FROM public.session_feedback sf WHERE lower(sf.faculty_email)=v_email AND sf.attendance_date BETWEEN p_start_date AND p_end_date;
  SELECT count(*), avg(understood::numeric) INTO v_pn, v_pa
    FROM public.session_feedback sf WHERE lower(sf.faculty_email)=v_email AND sf.attendance_date BETWEEN v_ps AND v_pe;
  IF v_cn < v_min OR v_pn < v_min THEN RETURN NULL; END IF;
  RETURN round(v_ca - v_pa, 3);
END; $$;

-- Lock both from anon (Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on every new function).
REVOKE EXECUTE ON FUNCTION public.calc_faculty_feedback_understood(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_feedback_understood(uuid,uuid,date,date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.calc_faculty_feedback_improvement(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_feedback_improvement(uuid,uuid,date,date) TO authenticated;

-- Register both metrics in the canonical OKR registry.
INSERT INTO public.okr_metric_registry
  (metric_key, display_name, module, category, source_type, source_config, applicable_roles, applicable_scopes, value_type)
VALUES
  ('faculty.feedback_understood','Student Understanding (avg 1-5)','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_feedback_understood"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'score'::metric_value_type),
  ('faculty.feedback_improvement','Understanding Trend (vs prev period)','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_feedback_improvement"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'number'::metric_value_type)
ON CONFLICT (metric_key) DO UPDATE SET
  display_name=EXCLUDED.display_name, module=EXCLUDED.module, category=EXCLUDED.category,
  source_type=EXCLUDED.source_type, source_config=EXCLUDED.source_config,
  applicable_roles=EXCLUDED.applicable_roles, applicable_scopes=EXCLUDED.applicable_scopes,
  value_type=EXCLUDED.value_type, updated_at=now();
