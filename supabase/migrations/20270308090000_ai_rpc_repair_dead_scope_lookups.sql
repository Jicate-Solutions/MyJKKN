-- ============================================================================
-- 20270308090000_ai_rpc_repair_dead_scope_lookups.sql
-- ----------------------------------------------------------------------------
-- AI assistant: repair 14 read-only lookups that call a scope helper which no
-- longer exists, plus two lookups whose bodies cannot run.       (2026-09-24)
--
-- FILE ONLY. NOT APPLIED. Apply only AFTER 20270307090000 (PR #3983) and only
-- on the Director's yes. The first block below REFUSES to run if #3983 is not
-- live yet, or if any of the 16 functions differs from what this file was
-- built from (md5 list below).
--
-- WHAT WAS BROKEN (verified live 2026-09-24)
--   These 14 SECURITY DEFINER functions start with
--       SELECT ai_rpc_accessible_scope(p_user_id) INTO v_scope;
--   and public.ai_rpc_accessible_scope() does not exist (see the header of
--   20260806130000), so every call raises
--       ERROR 42883: function ai_rpc_accessible_scope(uuid) does not exist
--   before it reads anything:
--     ai_rpc_academic_years, ai_rpc_attendance_summary, ai_rpc_bug_report_details,
--     ai_rpc_courses, ai_rpc_degrees, ai_rpc_faculty_assignments,
--     ai_rpc_institution_access, ai_rpc_periods, ai_rpc_staff_details,
--     ai_rpc_staff_plans, ai_rpc_timetable_slots, ai_rpc_timetables,
--     ai_rpc_user_roles, ai_rpc_users.
--   And two bodies cannot run at all:
--     ai_rpc_admission_analytics — nests COUNT(*) inside jsonb_object_agg (twice:
--       monthly_trend and by_reference_type) -> 42803 "aggregate function calls
--       cannot be nested".
--     ai_rpc_academic_context — reads academic_years.is_current and .name; the live
--       columns are is_active and academic_year_name -> 42703.
--
-- HOW THE SCOPE IS DECIDED NOW (no generic helper is resurrected)
--   Every function takes its rule from the SELECT policy of the table it reads
--   (live pg_policies, 2026-09-24), so the assistant shows no more than the
--   screen over that table does, and in several places less:
--     * identity: auth.uid() only (the 2026-07-12 pin is kept; p_user_id is ignored);
--     * permission: the key that table's policy asks for, via
--       public.user_has_permission(); a caller without it gets
--       {success:false, error.code:'FORBIDDEN'};
--     * institutions: public._user_accessible_institutions() — the canonical
--       set RLS already uses (every institution for which
--       public.role_has_institution_access() is true: own college, its CAS
--       sibling, an institution_scope='all' role, an active grant). Only a
--       super admin reads every college;
--     * every caller-supplied id is checked BEFORE it is used:
--         p_institution_id    -> public.role_has_institution_access(p_institution_id);
--         p_department_id, p_section_id, p_academic_year_id, p_student_id,
--         p_staff_id, p_timetable_id, p_target_user_id, p_bug_report_id
--                             -> the row's own institution is looked up and must be
--                                in the caller's set.
--       A foreign id is REFUSED with error.code 'FORBIDDEN_INSTITUTION' (or, for
--       the three "details" lookups, the existing 'NOT_FOUND ... or access
--       denied', which does not say whether the row exists);
--     * a non-super caller with no institution to look in gets
--       error.code 'NO_INSTITUTION', never a silent empty list.
--   ai_get_accessible_institutions() was NOT used: live, it gives a super admin
--   with a home college only that college, and gives a profile with no college
--   every college (#3983 changes the second half only).
--
-- PER FUNCTION (policy each rule mirrors, live 2026-09-24)
--   academic_years     academic.years.view            academic_years_select_permission
--   attendance_summary academic.attendance.view or    student_attendance_select_institution /
--                      .dashboard.view; OWN college   _select_dashboard_institution_access
--                      only unless dashboard.view
--   bug_report_details the reporter, or a super_admin/ bug_reports "Enhanced bug reports view
--                      admin/ceo profile role (as the access ..." (verbatim role list), plus
--                      policy), within the caller's   an institution narrowing the policy
--                      colleges                       does not have
--   courses            organizations.courses.view     courses_select_permission
--   degrees            no key (the policy admits any  degrees_select_by_role
--                      caller for their colleges)
--   periods            no key; OWN college only       periods_select_institution
--   staff_details,     staff.view + the staff module  staff_select_scope_aware
--   staff_plans,       scope (all_institutions /
--   faculty_assignments own_institution / own_records)
--   timetables,        academic.timetables.view       timetables_select_permission
--   timetable_slots
--   users              users.view (the /users screen  profiles_select_policy is wider
--                      key)                           (any signed-in user); narrowed here
--   user_roles         own rows for anyone; others    user_roles_select_admin / _own
--                      need super / is_admin() /
--                      roles.edit AND the target's
--                      college in the caller's set
--   institution_access own rows for anyone; others    user_institution_access policy is
--                      as user_roles                  own-rows-only; admin-grade widening
--                                                     is limited to the caller's colleges
--
-- WHAT DID NOT CHANGE
--   Signatures, defaults, SECURITY DEFINER, search_path, every SELECT list and
--   every output key. Only the scope lines, the new refusals and the WHERE
--   predicates that used v_scope change; each is marked `-- [scope-repair 2026-09-24]`.
--   Known quirks deliberately LEFT AS THEY WERE (not scope bugs; fixing them
--   changes answers): metadata.total_count is COUNT(*) OVER() over one
--   aggregated row, so it reads 1; ai_rpc_attendance_summary does not narrow by
--   p_student_id (student_attendance keeps learners inside attendance_data) —
--   the id is now access-checked but, as before, the counts are the section's;
--   ai_rpc_staff_plans only echoes p_timetable_id; ai_rpc_faculty_assignments
--   returns [] because no faculty_assignments table exists live (its own
--   information_schema check), now only after the permission and id checks.
--
-- SECTION B (ai_rpc_academic_context, ai_rpc_admission_analytics) starts from
-- PR #3983's GUARDED bodies, copied verbatim (its guards included), with only
-- the broken references fixed. That is why this file must sort AFTER
-- 20270307090000 and apply after it.
--
-- MD5 RE-CHECK LIST — md5(prosrc) this file was built from ("before"), and the
-- md5 this file leaves ("after"). The precondition block enforces it.
--   function                                                     before (live 2026-09-24)          after
--   ai_rpc_academic_years(uuid,uuid,integer,integer)             04de97aa21d92437e1ca17b8f38e1abc  6519aebc1336842b0a67a6a7e38da7ce
--   ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text)     97523943b875e4162305c6f0b76f66a8  e025e47dc27562e144a5f26af06111ce
--   ai_rpc_bug_report_details(uuid,uuid)                         30c5a9ca866186ba8c9d2b781a5d595f  c04c0ad3818c3361b3cfa8abe137e042
--   ai_rpc_courses(uuid,uuid,integer,integer)                    1886c9dc75acde347636c7ed98983413  72a0a4ea307d7bb72d27585ef9e3736d
--   ai_rpc_degrees(uuid,uuid,integer,integer)                    79342ca69b0ba3663d7431bc7091d724  c94b9824a3a43ccb3b4dbd55a365d00e
--   ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer)   2d953115cefdba7fe828eda5aca00427  c0573a222bcf36e3445214f26ef37eee
--   ai_rpc_institution_access(uuid,uuid,uuid,integer,integer)    2ed962ff3e26456d28b92d0ab056bba9  2c5b5a4c4e3d52c9cd126b7e61e1f8a4
--   ai_rpc_periods(uuid,uuid,integer,integer)                    c421689133a0ce8862b426a26f7fc373  729c2c998f939d147276738dfd251603
--   ai_rpc_staff_details(uuid,uuid)                              c91dc7f2dd3d8259724a33eef7266262  9eb18f59b55640c92f86536aacb4d759
--   ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer)           270dc58b9484cdea6fc6cc2b08e73852  297fb89182eb51666484fed7e56159c4
--   ai_rpc_timetable_slots(uuid,uuid,integer,integer)            c61201834b619c5ef12007d82528bc8c  89af0413c2b0bdc7e15044fcc4defb68
--   ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer)       d855e137f1cf745f49e2e3315182aee1  b741b35d6143d469843fd9ec107efa00
--   ai_rpc_user_roles(uuid,uuid,integer,integer)                 10dc4a4b4f9cdb0ce06d93684708d8f3  ca76ca25d10764ddf7e3f3d7714e2b15
--   ai_rpc_users(uuid,uuid,text,text,integer,integer)            bd852f9c98381019e98460f3452c6718  0b435e4b10976d6bfc0ec7a574550d8d
--   ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)           bdc6facf165c285bc4f3a3ba0c05c74c  f91567e569d7ff114630681da6c007fc
--   ai_rpc_academic_context(uuid)                                ca17b8f388b07b1cee87eeb95e29681b  ea25a9619c8d80a6674158eef0031275
--   (The two Section B "before" values are #3983's bodies as of its head
--   2c63e3fac8, i.e. what is live once #3983 is applied. Live today, before
--   #3983, they are 3dd178483a4c6831030310cee9a30b51 and
--   6474fe1fd5ce36e81dafe109194d2764; the block below refuses that state.)
--   Helpers read, not changed (live md5, 2026-09-24): role_has_institution_access(uuid)
--   d8b4b67ceca00988442c345a751b441d · _user_accessible_institutions()
--   87505b38ca0ddcb65cca4da3f38c479a · get_user_module_scope(text)
--   194e99c3cf22e899d3c3ecb182298c71 · user_has_permission(text)
--   8a1e0e82e6dc10ebebe9f336527ff44b · is_admin(uuid) bb5fbe1c30fa082e4e2b46a15c48c1e0
--   · is_super_admin() ed0a569a2dd1e9de10220608b299a5d8 · get_current_user_role()
--   5bb913dced3b6e0917e79cafe2bb5cad.
-- ============================================================================


-- ===== 0. Preconditions: #3983 first, and nothing drifted =====================
DO $pre$
DECLARE
  r     record;
  v_md5 text;
BEGIN
  IF position('[authz-guard 2026-09-23]' IN
       pg_get_functiondef('public.ai_rpc_students_summary(uuid,uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270308090000: apply 20270307090000_ai_rpc_scope_parameter_guards.sql (PR #3983) first — its guarded bodies are not live';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.ai_rpc_academic_years(uuid,uuid,integer,integer)',           '04de97aa21d92437e1ca17b8f38e1abc', '6519aebc1336842b0a67a6a7e38da7ce'),
      ('public.ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text)',   '97523943b875e4162305c6f0b76f66a8', 'e025e47dc27562e144a5f26af06111ce'),
      ('public.ai_rpc_bug_report_details(uuid,uuid)',                       '30c5a9ca866186ba8c9d2b781a5d595f', 'c04c0ad3818c3361b3cfa8abe137e042'),
      ('public.ai_rpc_courses(uuid,uuid,integer,integer)',                  '1886c9dc75acde347636c7ed98983413', '72a0a4ea307d7bb72d27585ef9e3736d'),
      ('public.ai_rpc_degrees(uuid,uuid,integer,integer)',                  '79342ca69b0ba3663d7431bc7091d724', 'c94b9824a3a43ccb3b4dbd55a365d00e'),
      ('public.ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer)', '2d953115cefdba7fe828eda5aca00427', 'c0573a222bcf36e3445214f26ef37eee'),
      ('public.ai_rpc_institution_access(uuid,uuid,uuid,integer,integer)',  '2ed962ff3e26456d28b92d0ab056bba9', '2c5b5a4c4e3d52c9cd126b7e61e1f8a4'),
      ('public.ai_rpc_periods(uuid,uuid,integer,integer)',                  'c421689133a0ce8862b426a26f7fc373', '729c2c998f939d147276738dfd251603'),
      ('public.ai_rpc_staff_details(uuid,uuid)',                            'c91dc7f2dd3d8259724a33eef7266262', '9eb18f59b55640c92f86536aacb4d759'),
      ('public.ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer)',         '270dc58b9484cdea6fc6cc2b08e73852', '297fb89182eb51666484fed7e56159c4'),
      ('public.ai_rpc_timetable_slots(uuid,uuid,integer,integer)',          'c61201834b619c5ef12007d82528bc8c', '89af0413c2b0bdc7e15044fcc4defb68'),
      ('public.ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer)',     'd855e137f1cf745f49e2e3315182aee1', 'b741b35d6143d469843fd9ec107efa00'),
      ('public.ai_rpc_user_roles(uuid,uuid,integer,integer)',               '10dc4a4b4f9cdb0ce06d93684708d8f3', 'ca76ca25d10764ddf7e3f3d7714e2b15'),
      ('public.ai_rpc_users(uuid,uuid,text,text,integer,integer)',          'bd852f9c98381019e98460f3452c6718', '0b435e4b10976d6bfc0ec7a574550d8d'),
      ('public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)',         'bdc6facf165c285bc4f3a3ba0c05c74c', 'f91567e569d7ff114630681da6c007fc'),
      ('public.ai_rpc_academic_context(uuid)',                              'ca17b8f388b07b1cee87eeb95e29681b', 'ea25a9619c8d80a6674158eef0031275')
    ) v(sig, before_md5, after_md5)
  LOOP
    SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p WHERE p.oid = r.sig::regprocedure;
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '20270308090000: % drifted — live md5(prosrc) % is neither % (what this file was built from) nor % (what it leaves). Re-read pg_get_functiondef and rebuild this file.',
        r.sig, v_md5, r.before_md5, r.after_md5;
    END IF;
  END LOOP;
END $pre$;


-- ############################################################################
-- SECTION A — the 14 lookups that call the missing ai_rpc_accessible_scope()
-- ############################################################################


-- ===== A1. ai_rpc_academic_years =============================================
CREATE OR REPLACE FUNCTION public.ai_rpc_academic_years(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_insts uuid[];    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors academic_years_select_permission: the key + role_has_institution_access().
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('academic.years.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view academic years.'));
  END IF;
  IF p_institution_id IS NOT NULL AND NOT v_super AND NOT public.role_has_institution_access(p_institution_id) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      ay.id,
      ay.academic_year_name,
      ay.start_date,
      ay.end_date,
      ay.is_active,
      ay.institution_id,
      ay.created_at
    FROM academic_years ay
    WHERE (v_super OR ay.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    ORDER BY ay.start_date DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_years(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_years(uuid, uuid, integer, integer) TO authenticated;


-- ===== A2. ai_rpc_attendance_summary =========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_attendance_summary(p_user_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;    -- [scope-repair 2026-09-24]
  v_insts uuid[];     -- [scope-repair 2026-09-24]
  v_ref_inst uuid;    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors student_attendance's policies: the attendance screens' keys; the caller's
  -- OWN college (student_attendance_select_institution), widened to every college
  -- role_has_institution_access() admits only for academic.attendance.dashboard.view
  -- holders (student_attendance_select_dashboard_institution_access).
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin()
          OR public.user_has_permission('academic.attendance.view')
          OR public.user_has_permission('academic.attendance.dashboard.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view learning participation (attendance).'));
  END IF;
  IF NOT v_super THEN
    IF public.user_has_permission('academic.attendance.dashboard.view') THEN
      v_insts := public._user_accessible_institutions();
    ELSE
      SELECT array_remove(ARRAY[pr.institution_id], NULL) INTO v_insts FROM profiles pr WHERE pr.id = auth.uid();
    END IF;
    IF COALESCE(cardinality(v_insts), 0) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
    -- every caller-supplied id must belong to a college in the caller's set
    IF p_student_id IS NOT NULL THEN
      SELECT lp.institution_id INTO v_ref_inst FROM learners_profiles lp WHERE lp.id = p_student_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That learner was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That learner belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    IF p_section_id IS NOT NULL THEN
      SELECT s.institution_id INTO v_ref_inst FROM sections s WHERE s.id = p_section_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That section was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That section belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    IF p_department_id IS NOT NULL THEN
      SELECT d.institution_id INTO v_ref_inst FROM departments d WHERE d.id = p_department_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That department was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That department belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'total_records', COUNT(*),
      'date_range', jsonb_build_object(
        'earliest', MIN(sa.attendance_date),
        'latest', MAX(sa.attendance_date)
      ),
      'sections_count', COUNT(DISTINCT sa.section_id),
      'by_section', COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'section_id', sa.section_id,
          'section_name', sec.section_name,
          'records_count', 1
        )), '[]'::jsonb
      )
    ),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object(
        'student_id', p_student_id,
        'section_id', p_section_id,
        'department_id', p_department_id,
        'date_from', p_date_from,
        'date_to', p_date_to
      )
    )
  )
  INTO v_result
  FROM student_attendance sa
  LEFT JOIN sections sec ON sa.section_id = sec.id
  WHERE (v_super OR sa.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
  AND (p_section_id IS NULL OR sa.section_id = p_section_id)
  AND (p_department_id IS NULL OR sa.department_id = p_department_id)
  AND (p_date_from IS NULL OR sa.attendance_date >= p_date_from::date)
  AND (p_date_to IS NULL OR sa.attendance_date <= p_date_to::date);

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_attendance_summary(uuid, uuid, uuid, uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_attendance_summary(uuid, uuid, uuid, uuid, text, text) TO authenticated;


-- ===== A3. ai_rpc_bug_report_details =========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_bug_report_details(p_user_id uuid, p_bug_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_bug record;       -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors the bug_reports SELECT policy ("Enhanced bug reports view access with
  -- department filtering", read live 2026-09-24): the reporter, or a profile whose
  -- role is super_admin / admin / ceo — the policy's own list, verbatim, because
  -- /admin/bug-reports reads through a security_invoker view and so shows exactly
  -- that. On top of the policy, a non-super caller only sees reports from colleges
  -- role_has_institution_access() admits (or with no college). A refusal reads the
  -- same as a missing report, as before.
  SELECT br.reporter_user_id, br.institution_id INTO v_bug FROM bug_reports br WHERE br.id = p_bug_report_id;
  IF NOT FOUND OR NOT (
       public.is_super_admin()
       OR v_bug.reporter_user_id = auth.uid()
       OR (public.get_current_user_role() IN ('super_admin', 'admin', 'ceo')
           AND (v_bug.institution_id IS NULL
                OR v_bug.institution_id = ANY(public._user_accessible_institutions())))
     ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Bug report not found or access denied')
    );
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(t),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object('bug_report_id', p_bug_report_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      br.id,
      br.display_id,
      br.description,
      br.page_url,
      br.screenshot_url,
      br.console_logs,
      br.metadata,
      br.status,
      br.priority,
      br.category,
      br.resolved_at,
      br.reporter_ip,
      br.reporter_user_agent,
      p.full_name as reporter_name,
      p.email as reporter_email,
      ap.full_name as assigned_to_name,
      i.name as institution_name,
      d.department_name,
      br.created_at,
      br.updated_at
    FROM bug_reports br
    LEFT JOIN profiles p ON br.reporter_user_id = p.id
    LEFT JOIN profiles ap ON br.assigned_to_user_id = ap.id
    LEFT JOIN institutions i ON br.institution_id = i.id
    LEFT JOIN departments d ON br.department_id = d.id
    WHERE br.id = p_bug_report_id   -- [scope-repair 2026-09-24] access decided above
  ) t;

  IF v_result IS NULL OR v_result->'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Bug report not found or access denied')
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_bug_report_details(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_bug_report_details(uuid, uuid) TO authenticated;


-- ===== A4. ai_rpc_courses ====================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_courses(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_insts uuid[];    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors courses_select_permission: the key + _user_accessible_institutions().
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('organizations.courses.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view courses.'));
  END IF;
  IF p_institution_id IS NOT NULL AND NOT v_super AND NOT public.role_has_institution_access(p_institution_id) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.course_code,
      c.course_name,
      c.is_active,
      c.institution_id,
      c.created_at
    FROM courses c
    WHERE (v_super OR c.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
    AND (p_institution_id IS NULL OR c.institution_id = p_institution_id)
    ORDER BY c.course_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_courses(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_courses(uuid, uuid, integer, integer) TO authenticated;


-- ===== A5. ai_rpc_degrees ====================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_degrees(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_insts uuid[];    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors degrees_select_by_role: any signed-in caller may read the degrees of
  -- every college role_has_institution_access() admits, so there is no key gate.
  -- (The policy's wider branches — is_admin(), organizations.degrees.view,
  -- the seat keys — are deliberately NOT widened to "every college" here.)
  v_super := public.is_super_admin();
  IF p_institution_id IS NOT NULL AND NOT v_super AND NOT public.role_has_institution_access(p_institution_id) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
  END IF;

  WITH degree_data AS (
    SELECT
      dg.id,
      dg.degree_name AS name,
      dg.degree_id AS code,
      dg.degree_type,
      dg.is_active,
      i.name AS institution_name,
      (SELECT COUNT(*) FROM programs p WHERE p.degree_id = dg.id) AS program_count,
      dg.created_at
    FROM degrees dg
    LEFT JOIN institutions i ON dg.institution_id = i.id
    WHERE
      (v_super OR dg.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
      AND (p_institution_id IS NULL OR dg.institution_id = p_institution_id)
    ORDER BY dg.degree_name
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(dd.*)), '[]'::JSONB),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM degree_data),
      'returned_count', COUNT(*),
      'has_more', false,
      'filters_applied', jsonb_build_object()
    ),
    'actions_available', '[]'::JSONB
  ) INTO v_result
  FROM (SELECT * FROM degree_data LIMIT p_limit OFFSET p_offset) dd;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_degrees(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_degrees(uuid, uuid, integer, integer) TO authenticated;


-- ===== A6. ai_rpc_faculty_assignments ========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_faculty_assignments(p_user_id uuid, p_staff_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;      -- [scope-repair 2026-09-24]
  v_insts uuid[];       -- [scope-repair 2026-09-24]
  v_staff_scope text;   -- [scope-repair 2026-09-24]
  v_ref_inst uuid;      -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors staff_select_scope_aware: staff.view + the caller's staff module scope.
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.user_has_permission('staff.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view team members.'));
  END IF;
  v_staff_scope := CASE WHEN v_super THEN 'all_institutions' ELSE public.get_user_module_scope('staff') END;
  IF v_staff_scope IS NULL OR v_staff_scope NOT IN ('all_institutions', 'own_institution', 'own_records') THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view team members.'));
  END IF;
  IF v_staff_scope <> 'all_institutions' THEN
    v_insts := public._user_accessible_institutions();
    IF v_staff_scope = 'own_institution' AND cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
    IF p_staff_id IS NOT NULL THEN
      SELECT st.institution_id INTO v_ref_inst FROM staff st WHERE st.id = p_staff_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That team member was not found.'));
      ELSIF v_ref_inst IS NOT NULL AND NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That team member belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    IF p_department_id IS NOT NULL THEN
      SELECT d.institution_id INTO v_ref_inst FROM departments d WHERE d.id = p_department_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That department was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That department belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  -- Check if faculty_assignments table exists, if not return empty
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'faculty_assignments') THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', '[]'::jsonb,
      'metadata', jsonb_build_object(
        'total_count', 0,
        'returned_count', 0,
        'has_more', false,
        'filters_applied', jsonb_build_object('staff_id', p_staff_id, 'department_id', p_department_id)
      )
    );
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('staff_id', p_staff_id, 'department_id', p_department_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      st.id as staff_id,
      st.staff_id as staff_code,
      st.first_name,
      st.last_name,
      st.designation,
      d.department_name,
      st.is_active
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE (v_staff_scope = 'all_institutions'   -- [scope-repair 2026-09-24] staff_select_scope_aware
           OR (v_staff_scope = 'own_institution' AND (st.institution_id IS NULL OR st.institution_id = ANY(v_insts)))
           OR (v_staff_scope = 'own_records' AND st.profile_id = auth.uid()))
    AND (p_staff_id IS NULL OR st.id = p_staff_id)
    AND (p_department_id IS NULL OR st.department_id = p_department_id)
    ORDER BY st.first_name, st.last_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_faculty_assignments(uuid, uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_faculty_assignments(uuid, uuid, uuid, integer, integer) TO authenticated;


-- ===== A7. ai_rpc_institution_access =========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_institution_access(p_user_id uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;    -- [scope-repair 2026-09-24]
  v_admin boolean;    -- [scope-repair 2026-09-24]
  v_insts uuid[];     -- [scope-repair 2026-09-24]
  v_ref_inst uuid;    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- user_institution_access's own policy lets a person read only their OWN grants.
  -- Anyone else's grants need an admin-grade caller — super admin, is_admin(), or
  -- roles.edit (the key user_roles_select_admin uses; grants are managed from Role
  -- Management) — AND the other person's home college must be one the caller may
  -- see, AND each grant shown must be to a college the caller may see.
  v_super := public.is_super_admin();
  v_admin := v_super OR public.is_admin() OR public.user_has_permission('roles.edit');
  IF p_target_user_id IS NOT NULL AND p_target_user_id <> auth.uid() AND NOT v_admin THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view another person''s institution access.'));
  END IF;
  IF p_institution_id IS NOT NULL AND NOT v_super AND NOT public.role_has_institution_access(p_institution_id) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super THEN
    v_insts := COALESCE(public._user_accessible_institutions(), ARRAY[]::uuid[]);
    IF p_target_user_id IS NOT NULL AND p_target_user_id <> auth.uid() THEN
      SELECT tp.institution_id INTO v_ref_inst FROM profiles tp WHERE tp.id = p_target_user_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That person was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That person belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'target_user_id', p_target_user_id,
        'institution_id', p_institution_id
      )
    )
  )
  INTO v_result
  FROM (
    SELECT
      uia.id,
      uia.user_id,
      uia.institution_id,
      uia.access_type,
      uia.is_active,
      uia.granted_at,
      p.full_name as user_name,
      p.email as user_email,
      i.name as institution_name,
      gp.full_name as granted_by_name
    FROM user_institution_access uia
    JOIN profiles p ON uia.user_id = p.id
    JOIN institutions i ON uia.institution_id = i.id
    LEFT JOIN profiles gp ON uia.granted_by = gp.id
    WHERE (v_super                                   -- [scope-repair 2026-09-24]
           OR uia.user_id = auth.uid()
           OR (v_admin AND uia.institution_id = ANY(v_insts) AND p.institution_id = ANY(v_insts)))
    AND (p_target_user_id IS NULL OR uia.user_id = p_target_user_id)
    AND (p_institution_id IS NULL OR uia.institution_id = p_institution_id)
    ORDER BY p.full_name, i.name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_institution_access(uuid, uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_institution_access(uuid, uuid, uuid, integer, integer) TO authenticated;


-- ===== A8. ai_rpc_periods ====================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_periods(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_own uuid;        -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors periods_select_institution: the caller's OWN college only, no key.
  -- A named institution must pass role_has_institution_access() AND be that college.
  v_super := public.is_super_admin();
  SELECT pr.institution_id INTO v_own FROM profiles pr WHERE pr.id = auth.uid();
  IF p_institution_id IS NOT NULL AND NOT v_super
     AND (NOT public.role_has_institution_access(p_institution_id) OR p_institution_id IS DISTINCT FROM v_own) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution''s periods.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super AND v_own IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
      'message','Your profile has no institution. Name an institution you have access to.'));
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('institution_id', p_institution_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      p.id,
      p.period_name,
      p.start_time,
      p.end_time,
      p.is_break,
      p.institution_id,
      p.created_at
    FROM periods p
    WHERE (v_super OR p.institution_id = v_own)   -- [scope-repair 2026-09-24]
    AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    ORDER BY p.start_time
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_periods(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_periods(uuid, uuid, integer, integer) TO authenticated;


-- ===== A9. ai_rpc_staff_details ==============================================
CREATE OR REPLACE FUNCTION public.ai_rpc_staff_details(p_user_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;      -- [scope-repair 2026-09-24]
  v_insts uuid[];       -- [scope-repair 2026-09-24]
  v_staff_scope text;   -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors staff_select_scope_aware: staff.view + the caller's staff module scope.
  -- A team member outside that scope reads as not found, as before.
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.user_has_permission('staff.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view team members.'));
  END IF;
  v_staff_scope := CASE WHEN v_super THEN 'all_institutions' ELSE public.get_user_module_scope('staff') END;
  IF v_staff_scope = 'own_institution' THEN
    v_insts := public._user_accessible_institutions();
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', row_to_json(t),
    'metadata', jsonb_build_object(
      'total_count', 1,
      'returned_count', 1,
      'has_more', false,
      'filters_applied', jsonb_build_object('staff_id', p_staff_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      st.id,
      st.staff_id,
      st.first_name,
      st.last_name,
      st.gender,
      st.date_of_birth,
      st.marital_status,
      st.blood_group,
      st.email,
      st.phone,
      st.institution_email,
      st.address,
      st.state,
      st.district,
      st.pincode,
      st.designation,
      st.date_of_joining,
      st.is_active,
      st.profile_picture,
      d.department_name,
      ec.category_name,
      i.name as institution_name,
      st.created_at,
      st.updated_at
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    LEFT JOIN employment_categories ec ON st.category_id = ec.id
    LEFT JOIN institutions i ON st.institution_id = i.id
    WHERE st.id = p_staff_id
    AND (v_staff_scope = 'all_institutions'   -- [scope-repair 2026-09-24] staff_select_scope_aware
         OR (v_staff_scope = 'own_institution' AND (st.institution_id IS NULL OR st.institution_id = ANY(v_insts)))
         OR (v_staff_scope = 'own_records' AND st.profile_id = auth.uid()))
  ) t;

  IF v_result IS NULL OR v_result->'data' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Team member not found or access denied')
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_staff_details(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_staff_details(uuid, uuid) TO authenticated;


-- ===== A10. ai_rpc_staff_plans ===============================================
CREATE OR REPLACE FUNCTION public.ai_rpc_staff_plans(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_timetable_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;      -- [scope-repair 2026-09-24]
  v_insts uuid[];       -- [scope-repair 2026-09-24]
  v_staff_scope text;   -- [scope-repair 2026-09-24]
  v_ref_inst uuid;      -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors staff_select_scope_aware: staff.view + the caller's staff module scope.
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.user_has_permission('staff.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view team members.'));
  END IF;
  v_staff_scope := CASE WHEN v_super THEN 'all_institutions' ELSE public.get_user_module_scope('staff') END;
  IF v_staff_scope IS NULL OR v_staff_scope NOT IN ('all_institutions', 'own_institution', 'own_records') THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view team members.'));
  END IF;
  IF v_staff_scope <> 'all_institutions' THEN
    v_insts := public._user_accessible_institutions();
    IF v_staff_scope = 'own_institution' AND cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
    IF p_department_id IS NOT NULL THEN
      SELECT d.institution_id INTO v_ref_inst FROM departments d WHERE d.id = p_department_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That department was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That department belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    -- p_timetable_id is only echoed in filters_applied (as before), but it is still checked
    IF p_timetable_id IS NOT NULL THEN
      SELECT tt.institution_id INTO v_ref_inst FROM timetables tt WHERE tt.id = p_timetable_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That timetable was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That timetable belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  -- Staff plans are typically embedded in timetable_data, return staff with their departments
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('department_id', p_department_id, 'timetable_id', p_timetable_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      st.id,
      st.staff_id,
      st.first_name,
      st.last_name,
      st.designation,
      d.department_name,
      st.is_active
    FROM staff st
    LEFT JOIN departments d ON st.department_id = d.id
    WHERE (v_staff_scope = 'all_institutions'   -- [scope-repair 2026-09-24] staff_select_scope_aware
           OR (v_staff_scope = 'own_institution' AND (st.institution_id IS NULL OR st.institution_id = ANY(v_insts)))
           OR (v_staff_scope = 'own_records' AND st.profile_id = auth.uid()))
    AND (p_department_id IS NULL OR st.department_id = p_department_id)
    AND st.is_active = true
    ORDER BY st.first_name, st.last_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_staff_plans(uuid, uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_staff_plans(uuid, uuid, uuid, integer, integer) TO authenticated;


-- ===== A11. ai_rpc_timetable_slots ===========================================
CREATE OR REPLACE FUNCTION public.ai_rpc_timetable_slots(p_user_id uuid, p_timetable_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_insts uuid[];    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors timetables_select_permission: academic.timetables.view +
  -- role_has_institution_access(). A timetable outside it reads as not found, as before.
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('academic.timetables.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view timetables.'));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(t.timetable_data, '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', jsonb_array_length(COALESCE(t.timetable_data, '[]'::jsonb)),
      'returned_count', jsonb_array_length(COALESCE(t.timetable_data, '[]'::jsonb)),
      'has_more', false,
      'filters_applied', jsonb_build_object('timetable_id', p_timetable_id),
      'timetable_name', t.timetable_name,
      'periods', t.periods
    )
  )
  INTO v_result
  FROM timetables t
  WHERE t.id = p_timetable_id
  AND (v_super OR t.institution_id = ANY(v_insts));   -- [scope-repair 2026-09-24]

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', null,
      'metadata', jsonb_build_object('total_count', 0, 'returned_count', 0, 'has_more', false, 'filters_applied', jsonb_build_object()),
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Timetable not found or access denied')
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_timetable_slots(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_timetable_slots(uuid, uuid, integer, integer) TO authenticated;


-- ===== A12. ai_rpc_timetables ================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_timetables(p_user_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;    -- [scope-repair 2026-09-24]
  v_insts uuid[];     -- [scope-repair 2026-09-24]
  v_ref_inst uuid;    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors timetables_select_permission: academic.timetables.view +
  -- role_has_institution_access().
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('academic.timetables.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view timetables.'));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
    IF p_department_id IS NOT NULL THEN
      SELECT d.institution_id INTO v_ref_inst FROM departments d WHERE d.id = p_department_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That department was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That department belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    IF p_academic_year_id IS NOT NULL THEN
      SELECT ay.institution_id INTO v_ref_inst FROM academic_years ay WHERE ay.id = p_academic_year_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That academic year was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That academic year belongs to an institution you do not have access to.'));
      END IF;
    END IF;
    IF p_section_id IS NOT NULL THEN
      SELECT s.institution_id INTO v_ref_inst FROM sections s WHERE s.id = p_section_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That section was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That section belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'department_id', p_department_id,
        'academic_year_id', p_academic_year_id,
        'section_id', p_section_id
      )
    )
  )
  INTO v_result
  FROM (
    SELECT
      t.id,
      t.timetable_name,
      t.timetable_type,
      t.is_active,
      t.is_template,
      t.version,
      t.start_date,
      t.end_date,
      t.timetable_format,
      d.department_name,
      sec.section_name,
      ay.academic_year_name,
      t.created_at
    FROM timetables t
    LEFT JOIN departments d ON t.department_id = d.id
    LEFT JOIN sections sec ON t.section_id = sec.id
    LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE (v_super OR t.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_academic_year_id IS NULL OR t.academic_year_id = p_academic_year_id)
    AND (p_section_id IS NULL OR t.section_id = p_section_id)
    ORDER BY t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_timetables(uuid, uuid, uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_timetables(uuid, uuid, uuid, uuid, integer, integer) TO authenticated;


-- ===== A13. ai_rpc_user_roles ================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_user_roles(p_user_id uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;    -- [scope-repair 2026-09-24]
  v_admin boolean;    -- [scope-repair 2026-09-24]
  v_insts uuid[];     -- [scope-repair 2026-09-24]
  v_ref_inst uuid;    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- Mirrors user_roles_select_own / _select_admin: anyone reads their OWN roles;
  -- anyone else's need super admin, is_admin() or roles.edit — AND, narrower than
  -- that policy, the other person's home college must be one the caller may see.
  -- (The old body also listed every super admin's roles to everyone; dropped.)
  v_super := public.is_super_admin();
  v_admin := v_super OR public.is_admin() OR public.user_has_permission('roles.edit');
  IF p_target_user_id IS NOT NULL AND p_target_user_id <> auth.uid() AND NOT v_admin THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view another person''s roles.'));
  END IF;
  IF NOT v_super THEN
    v_insts := COALESCE(public._user_accessible_institutions(), ARRAY[]::uuid[]);
    IF p_target_user_id IS NOT NULL AND p_target_user_id <> auth.uid() THEN
      SELECT tp.institution_id INTO v_ref_inst FROM profiles tp WHERE tp.id = p_target_user_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NOT_FOUND','message','That person was not found.'));
      ELSIF v_ref_inst IS NULL OR NOT (v_ref_inst = ANY(v_insts)) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
          'message','That person belongs to an institution you do not have access to.'));
      END IF;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object('target_user_id', p_target_user_id)
    )
  )
  INTO v_result
  FROM (
    SELECT
      ur.id,
      ur.user_id,
      ur.role_id,
      ur.is_primary,
      ur.assigned_at,
      p.full_name as user_name,
      p.email as user_email,
      cr.role_name,
      cr.role_key,
      cr.description as role_description
    FROM user_roles ur
    JOIN profiles p ON ur.user_id = p.id
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE (v_super                                   -- [scope-repair 2026-09-24]
           OR ur.user_id = auth.uid()
           OR (v_admin AND p.institution_id = ANY(v_insts)))
    AND (p_target_user_id IS NULL OR ur.user_id = p_target_user_id)
    ORDER BY p.full_name, ur.is_primary DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_user_roles(uuid, uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_user_roles(uuid, uuid, integer, integer) TO authenticated;


-- ===== A14. ai_rpc_users =====================================================
CREATE OR REPLACE FUNCTION public.ai_rpc_users(p_user_id uuid, p_institution_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_super boolean;   -- [scope-repair 2026-09-24]
  v_insts uuid[];    -- [scope-repair 2026-09-24]
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.'));
  END IF;
  p_user_id := auth.uid();
  -- [scope-repair 2026-09-24] replaces the call to the missing scope helper (it raised 42883).
  -- The /users screen's key (MENU_PERMISSIONS '/users': users.view) + the colleges
  -- role_has_institution_access() admits. Narrower than profiles_select_policy,
  -- which lets any signed-in user read every profile. (The old body also listed
  -- every super admin to everyone; dropped.)
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_admin() OR public.user_has_permission('users.view')) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN',
      'message','You do not have permission to view users.'));
  END IF;
  IF p_institution_id IS NOT NULL AND NOT v_super AND NOT public.role_has_institution_access(p_institution_id) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','FORBIDDEN_INSTITUTION',
      'message','You do not have access to that institution.', 'institution_id', p_institution_id));
  END IF;
  IF NOT v_super THEN
    v_insts := public._user_accessible_institutions();
    IF cardinality(v_insts) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
        'message','Your profile has no institution. Name an institution you have access to.'));
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', COUNT(*) OVER(),
      'returned_count', COUNT(*),
      'has_more', COUNT(*) OVER() > p_offset + p_limit,
      'filters_applied', jsonb_build_object(
        'institution_id', p_institution_id,
        'role', p_role,
        'search', p_search
      )
    )
  )
  INTO v_result
  FROM (
    SELECT
      p.id,
      p.full_name,
      p.email,
      p.phone_number,
      p.role,
      p.designation,
      p.is_active,
      p.profile_completed,
      p.avatar_url,
      p.last_login,
      i.name as institution_name,
      d.department_name,
      p.created_at
    FROM profiles p
    LEFT JOIN institutions i ON p.institution_id = i.id
    LEFT JOIN departments d ON p.department_id = d.id
    WHERE (v_super OR p.institution_id = ANY(v_insts))   -- [scope-repair 2026-09-24]
    AND (p_institution_id IS NULL OR p.institution_id = p_institution_id)
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_search IS NULL OR
         p.full_name ILIKE '%' || p_search || '%' OR
         p.email ILIKE '%' || p_search || '%')
    ORDER BY p.full_name
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_users(uuid, uuid, text, text, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_users(uuid, uuid, text, text, integer, integer) TO authenticated;


-- ############################################################################
-- SECTION B — two bodies that cannot run. Built on PR #3983's GUARDED bodies
-- (20270307090000, head 2c63e3fac8), copied VERBATIM — its [authz-guard
-- 2026-09-23] guards included. Only the broken references change, each marked
-- [scope-repair 2026-09-24]. MUST apply after 20270307090000 (block 0 enforces).
-- ############################################################################


-- ===== B1. ai_rpc_admission_analytics ========================================
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
  -- [authz-guard 2026-09-23] permission gate — a NEW restriction (see header): the key is the
  -- one lib/config/ai-query-tools-config.ts displays for this tool, which nothing enforced before.
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
  -- [authz-guard 2026-09-23] no institution to answer for: say so, never a silent zero.
  IF v_inst_id IS NULL AND NOT v_super THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
      'message','Your profile has no institution. Name an institution you have access to.'));
  END IF;

  WITH analytics AS (
    SELECT
      COUNT(*) as total_enquiries,
      COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active')) as converted,
      ROUND((COUNT(*) FILTER (WHERE lifecycle_status::TEXT IN ('admitted', 'active'))::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as conversion_rate,
      AVG(EXTRACT(DAY FROM (updated_at - created_at))) FILTER (WHERE lifecycle_status::TEXT = 'admitted') as avg_processing_days,
      -- [scope-repair 2026-09-24] the month-by-month object nested COUNT(*) inside jsonb_object_agg
      -- (42803). Count per month in a subquery over the SAME rows, then build the object.
      (SELECT jsonb_object_agg(m.month, m.cnt)
         FROM (SELECT TO_CHAR(lm.created_at, 'YYYY-MM') AS month, COUNT(*) AS cnt
                 FROM learners_profiles lm
                WHERE ((v_super AND v_inst_id IS NULL) OR lm.institution_id = v_inst_id)
                  AND (p_academic_year_id IS NULL OR lm.academic_year_id = p_academic_year_id)
                  AND lm.created_at IS NOT NULL
                GROUP BY 1) m) as monthly_trend,
      -- [scope-repair 2026-09-24] the by-reference-type object had the same nesting; same fix.
      (SELECT jsonb_object_agg(r.reference_type, r.cnt)
         FROM (SELECT lr.reference_type, COUNT(*) AS cnt
                 FROM learners_profiles lr
                WHERE ((v_super AND v_inst_id IS NULL) OR lr.institution_id = v_inst_id)
                  AND (p_academic_year_id IS NULL OR lr.academic_year_id = p_academic_year_id)
                  AND lr.reference_type IS NOT NULL
                GROUP BY 1) r) as by_reference_type
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


-- ===== B2. ai_rpc_academic_context ===========================================
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
  -- [authz-guard 2026-09-23] no institution to answer for: say so, never a silent answer.
  IF v_inst_id IS NULL AND NOT COALESCE(v_profile.is_super_admin, FALSE) THEN
    RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code','NO_INSTITUTION',
      'message','Your profile has no institution. Name an institution you have access to.'));
  END IF;
  -- [scope-repair 2026-09-24] the body read two columns academic_years does not have (42703);
  -- the live columns are is_active / academic_year_name. Newest active year first, so
  -- a college with more than one active year answers deterministically.
  SELECT * INTO v_academic_year
  FROM academic_years
  WHERE is_active = true
  AND ((COALESCE(v_profile.is_super_admin, FALSE) AND v_inst_id IS NULL) OR institution_id = v_inst_id)
  ORDER BY start_date DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'academic_year_id', v_academic_year.id,
    'academic_year_name', v_academic_year.academic_year_name,
    'start_date', v_academic_year.start_date,
    'end_date', v_academic_year.end_date
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_academic_context(uuid) TO authenticated;


-- ===== Apply-time self-check =================================================
-- "CREATE OR REPLACE did not take" must not read as a clean apply.
DO $$
DECLARE
  v_fn  text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.ai_rpc_academic_years(uuid,uuid,integer,integer)',
    'public.ai_rpc_attendance_summary(uuid,uuid,uuid,uuid,text,text)',
    'public.ai_rpc_bug_report_details(uuid,uuid)',
    'public.ai_rpc_courses(uuid,uuid,integer,integer)',
    'public.ai_rpc_degrees(uuid,uuid,integer,integer)',
    'public.ai_rpc_faculty_assignments(uuid,uuid,uuid,integer,integer)',
    'public.ai_rpc_institution_access(uuid,uuid,uuid,integer,integer)',
    'public.ai_rpc_periods(uuid,uuid,integer,integer)',
    'public.ai_rpc_staff_details(uuid,uuid)',
    'public.ai_rpc_staff_plans(uuid,uuid,uuid,integer,integer)',
    'public.ai_rpc_timetable_slots(uuid,uuid,integer,integer)',
    'public.ai_rpc_timetables(uuid,uuid,uuid,uuid,integer,integer)',
    'public.ai_rpc_user_roles(uuid,uuid,integer,integer)',
    'public.ai_rpc_users(uuid,uuid,text,text,integer,integer)',
    'public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)',
    'public.ai_rpc_academic_context(uuid)'
  ] LOOP
    v_def := pg_get_functiondef(v_fn::regprocedure);
    IF position('[scope-repair 2026-09-24]' IN v_def) = 0 THEN
      RAISE EXCEPTION '20270308090000: % is missing the 2026-09-24 repair after CREATE OR REPLACE', v_fn;
    END IF;
    IF position('ai_rpc_accessible_scope' IN v_def) > 0 THEN
      RAISE EXCEPTION '20270308090000: % still calls the missing ai_rpc_accessible_scope()', v_fn;
    END IF;
    IF position('p_user_id := auth.uid()' IN v_def) = 0 AND v_fn <> 'public.ai_rpc_academic_context(uuid)' THEN
      RAISE EXCEPTION '20270308090000: % lost the auth.uid() identity pin', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '20270308090000: anon can still EXECUTE %', v_fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '20270308090000: % is no longer SECURITY DEFINER', v_fn;
    END IF;
  END LOOP;
  IF position('jsonb_object_agg(TO_CHAR(created_at' IN pg_get_functiondef('public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION '20270308090000: ai_rpc_admission_analytics still nests an aggregate';
  END IF;
  IF position('is_current' IN pg_get_functiondef('public.ai_rpc_academic_context(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION '20270308090000: ai_rpc_academic_context still reads academic_years.is_current';
  END IF;
  IF position('[authz-guard 2026-09-23]' IN pg_get_functiondef('public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)'::regprocedure)) = 0
     OR position('[authz-guard 2026-09-23]' IN pg_get_functiondef('public.ai_rpc_academic_context(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270308090000: Section B lost #3983''s institution guards';
  END IF;
END $$;
