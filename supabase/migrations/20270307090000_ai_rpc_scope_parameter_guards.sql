-- ============================================================================
-- 20270307090000_ai_rpc_scope_parameter_guards.sql
-- ----------------------------------------------------------------------------
-- SECURITY — AI lookups honoured a caller-supplied institution id without
-- checking that the caller may see that institution.            (2026-09-23)
--
-- FILE ONLY. NOT APPLIED by the lane that wrote it. Apply at merge time, after
-- diffing each function below against its LIVE definition
-- (pg_get_functiondef) — see "STARTED FROM" per function.
--
-- THE HOLE
--   The 2026-07-12 confused-deputy sweep (20260712134500) pinned p_user_id to
--   auth.uid(), but four readers then did
--       v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);
--       ... WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
--   so ANY signed-in non-super caller could pass another college's id and read
--   that college's numbers — and, for ai_rpc_admission_referrers, the names and
--   contact numbers of the people who referred its learners. The assistant's
--   model can be steered into passing that id by an ordinary question ("how many
--   learners in the Dental college?"), and the MCP door will let outside AIs call
--   these functions with arbitrary arguments.
--
-- THE RULE (same shape as the 2026-07-12 gap lookups, 20260712233000, with the
-- refinements the spec and review #3983 ask for):
--   * permission (the four readers) -> super admin, is_admin(), or
--                               user_has_permission(<the key the app's tool config
--                               gates on>): learners.view for students_summary /
--                               students_by_department, learners.admissions.dashboard
--                               for admission_analytics / admission_referrers.
--                               Otherwise {success:false, error.code:'FORBIDDEN'}.
--                               Before this, the only gate was in the app
--                               (lib/config/ai-query-tools-config.ts), so any signed-in
--                               account — a learner included — could call
--                               /rest/v1/rpc/ai_rpc_admission_referrers directly and
--                               read its own college's referrer names and phones.
--   * super admin            -> p_institution_id NARROWS to that college; NULL = all.
--                               (Before, a super admin's id was ignored and every
--                               college's totals came back under one college's name.)
--   * everyone else          -> NULL = own institution, NEVER "all institutions".
--                               A named p_institution_id is honoured ONLY when
--                               role_has_institution_access(p_institution_id) is TRUE
--                               (own college, its CAS sibling, an
--                               institution_scope='all' role, an explicit
--                               user_institution_access grant). Otherwise the call is
--                               REFUSED with error.code 'FORBIDDEN_INSTITUTION' — never
--                               silently answered with the caller's own college, which
--                               would present one college's numbers as another's
--                               (CLAUDE.md rule #27: permission failures are explicit).
--   * no own institution     -> v_inst_id stays NULL -> `institution_id = NULL`
--                               matches nothing -> 0 rows (fail closed).
--
-- WHO institution_scope='all' ADMITS (read live 2026-09-23, information only):
--   39 custom_roles carry institution_scope='all', all is_active=true, so
--   role_has_institution_access() not reading custom_roles.is_active changes
--   nothing today. Of those, the ones that ALSO hold learners.admissions.dashboard
--   (administrator, admission, ceo, coo, expo_counselor, health_counselor,
--   learner_counselor, managing_director, registrar, staff_counselor) are the only
--   scope-'all' holders ai_rpc_admission_referrers now answers for every college —
--   and every one of them also holds learners.admissions.view, which the
--   learners_profiles SELECT policy (20260909170000) already honours across every
--   college role_has_institution_access() admits, reference_contact included. So
--   the function gives them nothing the table does not. The other scope-'all'
--   roles (accounts, admission_counselor, system_admin, ...) are refused by the
--   permission gate above.
--
-- WHAT CHANGED, AND WHAT DID NOT
--   Only the permission gate, the lines that pick the effective institution and
--   the institution predicate of each WHERE change; every other part of every
--   query, return shape, signature and default is byte-identical to the file each
--   function was STARTED FROM. The four readers that lacked it gain
--   `SET search_path = public` (the other ai_rpc_* functions already carry it).
--   Each change is marked `-- [authz-guard 2026-09-23]`.
--
--   1. ai_rpc_students_summary        STARTED FROM 20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql
--   2. ai_rpc_students_by_department  STARTED FROM 20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql
--   3. ai_rpc_admission_analytics     STARTED FROM 20261204090000_fix_ai_rpc_lifecycle_status_literals.sql
--   4. ai_rpc_admission_referrers     STARTED FROM 20261204090000_fix_ai_rpc_lifecycle_status_literals.sql
--   5. ai_rpc_academic_context        STARTED FROM 20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql
--        LATENT: its body reads TWO columns academic_years does not have —
--        `is_current` (the WHERE) and `v_academic_year.name` (the RETURN). The
--        live table carries `is_active` and `academic_year_name` instead
--        (information_schema read 2026-09-23; types/supabase.ts agrees), so today
--        every call that reaches the SELECT raises 42703. Whoever fixes it must fix
--        BOTH: correcting only is_current still raises on .name. Guarded anyway so
--        the hole does not open the day someone fixes the columns; both broken
--        references are deliberately left untouched here (no app tool calls it).
--   6. ai_get_accessible_institutions STARTED FROM 20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql
--        Shared helper behind ai_rpc_departments / _programs / _semesters /
--        _sections / _staff / _staff_by_department. A caller whose profile has
--        NO institution got EVERY active institution, whoever they were. Now
--        only a super admin, an admin (is_admin()) or a caller whom
--        role_has_institution_access() admits to that institution does. The
--        own-institution branch is unchanged.
--
-- Every other ai_rpc_* function was read and judged safe; the list, with one
-- line of reason each, is in the PR body.
-- ============================================================================


-- ===== 1. ai_rpc_students_summary ============================================
CREATE OR REPLACE FUNCTION public.ai_rpc_students_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_super BOOLEAN; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_super := COALESCE(v_profile.is_super_admin, FALSE);
  -- [authz-guard 2026-09-23] permission gate in the database, not only in the app:
  -- the same key lib/config/ai-query-tools-config.ts gates this tool on.
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('learners.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view learner data.'));
  END IF;
  -- [authz-guard 2026-09-23] effective institution. Super admin: p_institution_id narrows,
  -- NULL = all. Anyone else: NULL = own institution; a named institution is honoured only
  -- when role_has_institution_access() admits it, and is otherwise REFUSED — never
  -- silently swapped for the caller's own (that answered with the wrong college's data).
  IF v_super THEN
    v_inst_id := p_institution_id;
  ELSIF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;

  WITH summary AS (
    SELECT COUNT(*) as total_learners,
           COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'active') as active_count,
           COUNT(*) FILTER (WHERE gender = 'Male') as male_count,
           COUNT(*) FILTER (WHERE gender = 'Female') as female_count,
           COUNT(*) FILTER (WHERE accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')) as hostel_count,
           COUNT(*) FILTER (WHERE bus_required = TRUE) as bus_required_count
           -- REMOVED: COUNT(*) FILTER (WHERE first_graduate = TRUE) as first_graduate_count
    FROM learners_profiles
    WHERE ((v_super AND v_inst_id IS NULL) OR institution_id = v_inst_id)   -- [authz-guard 2026-09-23] a super admin's id now narrows
      AND (p_department_id IS NULL OR department_id = p_department_id)
  )
  SELECT jsonb_build_object('success', TRUE, 'data', row_to_json(s)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM summary s;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_students_summary(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_students_summary(uuid, uuid, uuid) TO authenticated;


-- ===== 2. ai_rpc_students_by_department ======================================
CREATE OR REPLACE FUNCTION public.ai_rpc_students_by_department(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_super BOOLEAN; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_super := COALESCE(v_profile.is_super_admin, FALSE);
  -- [authz-guard 2026-09-23] permission gate in the database, not only in the app:
  -- the same key lib/config/ai-query-tools-config.ts gates this tool on.
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('learners.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view learner data.'));
  END IF;
  -- [authz-guard 2026-09-23] effective institution. Super admin: p_institution_id narrows,
  -- NULL = all. Anyone else: NULL = own institution; a named institution is honoured only
  -- when role_has_institution_access() admits it, and is otherwise REFUSED — never
  -- silently swapped for the caller's own (that answered with the wrong college's data).
  IF v_super THEN
    v_inst_id := p_institution_id;
  ELSIF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;

  WITH dept_stats AS (
    SELECT d.id as department_id, d.department_name, d.department_code,
           COUNT(*) as total_learners,
           COUNT(*) FILTER (WHERE lp.lifecycle_status::TEXT = 'active') as active_count,
           COUNT(*) FILTER (WHERE lp.gender = 'Male') as male_count,
           COUNT(*) FILTER (WHERE lp.gender = 'Female') as female_count
    FROM departments d
    LEFT JOIN learners_profiles lp ON d.id = lp.department_id
      AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
    WHERE ((v_super AND v_inst_id IS NULL) OR d.institution_id = v_inst_id)   -- [authz-guard 2026-09-23] a super admin's id now narrows
    GROUP BY d.id, d.department_name, d.department_code
    ORDER BY d.department_name
  )
  SELECT jsonb_build_object('success', TRUE, 'data', COALESCE(jsonb_agg(row_to_json(ds)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM dept_stats), 'returned_count', (SELECT COUNT(*) FROM dept_stats), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM dept_stats ds;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_students_by_department(uuid, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_students_by_department(uuid, uuid, text) TO authenticated;


-- ===== 3. ai_rpc_admission_analytics =========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_analytics(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_include_trends boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_super BOOLEAN; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_super := COALESCE(v_profile.is_super_admin, FALSE);
  -- [authz-guard 2026-09-23] permission gate in the database, not only in the app:
  -- the same key lib/config/ai-query-tools-config.ts gates this tool on.
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('learners.admissions.dashboard')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view admission analytics.'));
  END IF;
  -- [authz-guard 2026-09-23] effective institution. Super admin: p_institution_id narrows,
  -- NULL = all. Anyone else: NULL = own institution; a named institution is honoured only
  -- when role_has_institution_access() admits it, and is otherwise REFUSED — never
  -- silently swapped for the caller's own (that answered with the wrong college's data).
  IF v_super THEN
    v_inst_id := p_institution_id;
  ELSIF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;

  WITH analytics AS (
    SELECT
      COUNT(*) as total_enquiries,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active')) as converted,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
      AVG(EXTRACT(DAY FROM (updated_at - created_at))) FILTER (WHERE lifecycle_status::TEXT = 'admitted') as avg_processing_days,
      jsonb_object_agg(TO_CHAR(created_at, 'YYYY-MM'), COUNT(*)) as monthly_trend,
      jsonb_object_agg(reference_type, COUNT(*)) FILTER (WHERE reference_type IS NOT NULL) as by_reference_type
    FROM learners_profiles
    WHERE ((v_super AND v_inst_id IS NULL) OR institution_id = v_inst_id)   -- [authz-guard 2026-09-23] a super admin's id now narrows
      AND (p_academic_year_id IS NULL OR academic_year_id = p_academic_year_id)
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', row_to_json(a)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM analytics a;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_analytics(uuid, uuid, uuid, boolean) TO authenticated;


-- ===== 4. ai_rpc_admission_referrers =========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_admission_referrers(p_user_id uuid, p_reference_type text DEFAULT NULL::text, p_reference_name text DEFAULT NULL::text, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_top_n integer DEFAULT 10, p_include_details boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_super BOOLEAN; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_super := COALESCE(v_profile.is_super_admin, FALSE);
  -- [authz-guard 2026-09-23] permission gate in the database, not only in the app:
  -- the same key lib/config/ai-query-tools-config.ts gates this tool on.
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('learners.admissions.dashboard')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view admission referrers.'));
  END IF;
  -- [authz-guard 2026-09-23] effective institution. Super admin: p_institution_id narrows,
  -- NULL = all. Anyone else: NULL = own institution; a named institution is honoured only
  -- when role_has_institution_access() admits it, and is otherwise REFUSED — never
  -- silently swapped for the caller's own (that answered with the wrong college's data).
  IF v_super THEN
    v_inst_id := p_institution_id;
  ELSIF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;

  WITH referrer_stats AS (
    SELECT
      reference_type,
      reference_name,
      reference_contact,
      COUNT(*) as total_referrals,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active')) as converted_count,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
      jsonb_agg(DISTINCT program_name) FILTER (WHERE program_name IS NOT NULL) as programs_referred,
      jsonb_agg(DISTINCT permanent_address_district) FILTER (WHERE permanent_address_district IS NOT NULL) as districts_covered
    FROM (
      SELECT lp.*, p.program_name
      FROM learners_profiles lp
      LEFT JOIN programs p ON lp.program_id = p.id
      WHERE ((v_super AND v_inst_id IS NULL) OR lp.institution_id = v_inst_id)   -- [authz-guard 2026-09-23] a super admin's id now narrows
        AND lp.reference_type IS NOT NULL
        AND lp.reference_name IS NOT NULL
        AND (p_reference_type IS NULL OR lp.reference_type ILIKE p_reference_type)
        AND (p_reference_name IS NULL OR lp.reference_name ILIKE '%' || p_reference_name || '%')
        AND (p_program_id IS NULL OR lp.program_id = p_program_id)
        AND (p_department_id IS NULL OR lp.department_id = p_department_id)
        AND (p_status IS NULL OR lp.lifecycle_status::TEXT ILIKE p_status)
        AND (p_date_from IS NULL OR lp.created_at::DATE >= p_date_from::DATE)
        AND (p_date_to IS NULL OR lp.created_at::DATE <= p_date_to::DATE)
    ) referrals
    GROUP BY reference_type, reference_name, reference_contact
    ORDER BY total_referrals DESC, conversion_rate DESC
    LIMIT p_top_n
  )
  SELECT jsonb_build_object(
    'success', TRUE,
    'data', COALESCE(jsonb_agg(row_to_json(rs)::jsonb), '[]'::jsonb),
    'metadata', jsonb_build_object('total_count', (SELECT COUNT(*) FROM referrer_stats), 'returned_count', (SELECT COUNT(*) FROM referrer_stats), 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM referrer_stats rs;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_admission_referrers(uuid, text, text, uuid, uuid, uuid, text, text, text, integer, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_admission_referrers(uuid, text, text, uuid, uuid, uuid, text, text, text, integer, boolean) TO authenticated;


-- ===== 5. ai_rpc_academic_context (latent — see header) =======================
CREATE OR REPLACE FUNCTION public.ai_rpc_academic_context(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_academic_year RECORD;
  v_profile RECORD;
  v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  -- [authz-guard 2026-09-23] a super admin keeps the old meaning (NULL = any institution);
  -- anyone else: NULL = own institution (no longer "any institution"); a named institution is
  -- honoured only when role_has_institution_access() admits it, and is otherwise REFUSED.
  SELECT institution_id, COALESCE(is_super_admin, FALSE) AS is_super_admin
    INTO v_profile
    FROM profiles WHERE id = auth.uid();
  IF COALESCE(v_profile.is_super_admin, FALSE) THEN
    v_inst_id := p_institution_id;
  ELSIF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  -- LATENT (see header): `is_current` below and `.name` in the RETURN are BOTH missing
  -- columns (live: is_active, academic_year_name). Fixing one alone still raises 42703.
  SELECT * INTO v_academic_year
  FROM academic_years
  WHERE is_current = true
  AND ((COALESCE(v_profile.is_super_admin, FALSE) AND v_inst_id IS NULL) OR institution_id = v_inst_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'academic_year_id', v_academic_year.id,
    'academic_year_name', v_academic_year.name,
    'start_date', v_academic_year.start_date,
    'end_date', v_academic_year.end_date
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) TO authenticated;


-- ===== 6. ai_get_accessible_institutions (shared helper) =====================
CREATE OR REPLACE FUNCTION public.ai_get_accessible_institutions(p_user_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_institution_id uuid;
    v_result uuid[];
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;
  p_user_id := auth.uid();
    -- Get user's institution_id from profiles
    SELECT institution_id INTO v_user_institution_id
    FROM profiles WHERE id = p_user_id;

    IF v_user_institution_id IS NULL THEN
        -- [authz-guard 2026-09-23] a profile with no institution used to mean "every active
        -- institution" for ANY caller. Now only a super admin or admin gets all of them;
        -- anyone else gets exactly the institutions role_has_institution_access() admits
        -- (an institution_scope='all' role, or explicit user_institution_access grants).
        SELECT array_agg(i.id) INTO v_result
        FROM institutions i
        WHERE i.is_active = true
          AND (public.is_super_admin() OR public.is_admin() OR public.role_has_institution_access(i.id));
    ELSE
        -- User has access only to their institution
        v_result := ARRAY[v_user_institution_id];
    END IF;

    RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_get_accessible_institutions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_get_accessible_institutions(uuid) TO authenticated;


-- ===== Apply-time self-check =================================================
-- "CREATE OR REPLACE did not take" must not read as a clean apply: every
-- function above must now carry the 2026-09-23 guard marker, none of the
-- five readers may still carry the unguarded COALESCE, the five readers must
-- REFUSE a foreign institution explicitly, the four row readers must no longer
-- ignore a super admin's institution, and the four must gate on a permission.
DO $$
DECLARE
  v_fn  text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.ai_rpc_students_summary(uuid,uuid,uuid)',
    'public.ai_rpc_students_by_department(uuid,uuid,text)',
    'public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)',
    'public.ai_rpc_admission_referrers(uuid,text,text,uuid,uuid,uuid,text,text,text,integer,boolean)',
    'public.ai_rpc_academic_context(uuid)',
    'public.ai_get_accessible_institutions(uuid)'
  ] LOOP
    v_def := pg_get_functiondef(v_fn::regprocedure);
    IF position('[authz-guard 2026-09-23]' IN v_def) = 0 THEN
      RAISE EXCEPTION '20270307090000: % is missing the 2026-09-23 guard after CREATE OR REPLACE', v_fn;
    END IF;
    IF position('COALESCE(p_institution_id, v_profile.institution_id)' IN v_def) > 0 THEN
      RAISE EXCEPTION '20270307090000: % still resolves the institution with the unguarded COALESCE', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '20270307090000: anon can still EXECUTE %', v_fn;
    END IF;
    IF v_fn <> 'public.ai_get_accessible_institutions(uuid)'
       AND position('FORBIDDEN_INSTITUTION' IN v_def) = 0 THEN
      RAISE EXCEPTION '20270307090000: % does not refuse a foreign institution explicitly', v_fn;
    END IF;
    IF position('v_profile.is_super_admin = TRUE OR' IN v_def) > 0 THEN
      RAISE EXCEPTION '20270307090000: % still ignores a super admin''s institution filter', v_fn;
    END IF;
    IF v_fn NOT IN ('public.ai_rpc_academic_context(uuid)', 'public.ai_get_accessible_institutions(uuid)')
       AND position('public.user_has_permission(' IN v_def) = 0 THEN
      RAISE EXCEPTION '20270307090000: % has no permission gate', v_fn;
    END IF;
  END LOOP;
END $$;
