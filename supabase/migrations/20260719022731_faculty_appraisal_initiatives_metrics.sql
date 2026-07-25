-- Migration: Faculty Appraisal "Metric 4" (innovations / patents / publications)
-- wired into the canonical OKR metric registry.
-- Date: 2026-07-19 (UTC 20260719022731)
-- Source table: public.faculty_initiatives ONLY (inventor_id = faculty profile id).
-- Category mapping: publications='publication'; patents='ip_bearing';
--   innovations=COMPLEMENT (neither publication nor patent) so
--   total = publications + patents + innovations is always conserved.
-- Date window key = COALESCE(submitted_at::date, last_status_change_at::date);
--   filter when a bound is provided, count all when NULL.
-- 4-arg signature (p_profile_id, p_institution_id, p_start_date, p_end_date)
--   fixed by the live canonical template calc_staff_count_wrapper.
-- INVOKER (default), STABLE, plpgsql, RETURNS numeric. Idempotent.

CREATE OR REPLACE FUNCTION public.calc_faculty_initiatives_total(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.faculty_initiatives fi
          WHERE fi.inventor_id = p_profile_id
            AND (p_start_date IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) >= p_start_date)
            AND (p_end_date   IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) <= p_end_date))::numeric;
END; $$;

CREATE OR REPLACE FUNCTION public.calc_faculty_publications(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.faculty_initiatives fi
          WHERE fi.inventor_id = p_profile_id
            AND fi.category = 'publication'
            AND (p_start_date IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) >= p_start_date)
            AND (p_end_date   IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) <= p_end_date))::numeric;
END; $$;

CREATE OR REPLACE FUNCTION public.calc_faculty_patents(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.faculty_initiatives fi
          WHERE fi.inventor_id = p_profile_id
            AND fi.category = 'ip_bearing'
            AND (p_start_date IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) >= p_start_date)
            AND (p_end_date   IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) <= p_end_date))::numeric;
END; $$;

CREATE OR REPLACE FUNCTION public.calc_faculty_innovations(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.faculty_initiatives fi
          WHERE fi.inventor_id = p_profile_id
            AND fi.category IS DISTINCT FROM 'publication'
            AND fi.category IS DISTINCT FROM 'ip_bearing'
            AND (p_start_date IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) >= p_start_date)
            AND (p_end_date   IS NULL OR COALESCE(fi.submitted_at::date, fi.last_status_change_at::date) <= p_end_date))::numeric;
END; $$;

-- Lock each wrapper from anon (standard MyJKKN rule — Supabase default grants EXECUTE to anon).
REVOKE EXECUTE ON FUNCTION public.calc_faculty_initiatives_total(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_initiatives_total(uuid,uuid,date,date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.calc_faculty_publications(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_publications(uuid,uuid,date,date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.calc_faculty_patents(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_patents(uuid,uuid,date,date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.calc_faculty_innovations(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_innovations(uuid,uuid,date,date) TO authenticated;

-- Register the 4 metrics in the canonical OKR registry (idempotent upsert).
-- metric_key stays DOTTED; source_config.function_name points at the real identifier.
INSERT INTO public.okr_metric_registry
  (metric_key, display_name, module, category, source_type, source_config, applicable_roles, applicable_scopes, value_type)
VALUES
  ('faculty.initiatives_total','Faculty Initiatives (Total)','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_initiatives_total"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'count'::metric_value_type),
  ('faculty.publications','Publications','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_publications"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'count'::metric_value_type),
  ('faculty.patents','Patents / IP','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_patents"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'count'::metric_value_type),
  ('faculty.innovations','Innovations','faculty_appraisal','academic','db_function','{"function_name":"calc_faculty_innovations"}'::jsonb,'{faculty,hod}'::text[],'{individual}'::metric_scope[],'count'::metric_value_type)
ON CONFLICT (metric_key) DO UPDATE SET
  display_name=EXCLUDED.display_name, module=EXCLUDED.module, category=EXCLUDED.category,
  source_type=EXCLUDED.source_type, source_config=EXCLUDED.source_config,
  applicable_roles=EXCLUDED.applicable_roles, applicable_scopes=EXCLUDED.applicable_scopes,
  value_type=EXCLUDED.value_type, updated_at=now();
