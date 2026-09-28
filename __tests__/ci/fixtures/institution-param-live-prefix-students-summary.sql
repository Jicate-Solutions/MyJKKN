-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- The pre-fix ai_rpc_students_summary, byte-for-byte from
-- supabase/migrations/20260712134500_ai_rpc_authuid_confused_deputy_sweep.sql lines 3135-3169:
-- the body that let a one-college head of department read another college's
-- 1,511 learners (measured live 2026-09-23). The gate MUST fail it.
-- Its grants lived in an earlier migration, so none are restated here, exactly
-- like the original file: CREATE OR REPLACE keeps them.

CREATE OR REPLACE FUNCTION public.ai_rpc_students_summary(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_result JSONB; v_profile RECORD; v_inst_id UUID;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = p_user_id;
  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);

  WITH summary AS (
    SELECT COUNT(*) as total_learners,
           COUNT(*) FILTER (WHERE lifecycle_status::TEXT = 'active') as active_count,
           COUNT(*) FILTER (WHERE gender = 'Male') as male_count,
           COUNT(*) FILTER (WHERE gender = 'Female') as female_count,
           COUNT(*) FILTER (WHERE accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')) as hostel_count,
           COUNT(*) FILTER (WHERE bus_required = TRUE) as bus_required_count
           -- REMOVED: COUNT(*) FILTER (WHERE first_graduate = TRUE) as first_graduate_count
    FROM learners_profiles
    WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  )
  SELECT jsonb_build_object('success', TRUE, 'data', row_to_json(s)::jsonb,
    'metadata', jsonb_build_object('total_count', 1, 'returned_count', 1, 'has_more', FALSE),
    'actions_available', '[]'::jsonb
  ) INTO v_result FROM summary s;
  
  RETURN v_result;
END;
$function$;
