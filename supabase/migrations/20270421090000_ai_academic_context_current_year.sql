-- ============================================================================
-- 20270421090000_ai_academic_context_current_year.sql
-- Created: 2026-09-28
--
-- PROBLEM (measured live 2026-09-28, read-only):
--   ai_rpc_academic_context answers "which academic year are we in" for the AI
--   Assistant. Its 2026-09-24 repair (20270308090000) picks the NEWEST row with
--   is_active = true. But is_active means "not archived", not "current": 11 of
--   the 12 institutions keep several years active. Engineering has 2022-2023
--   through 2027-2028 all active, so on 28 Sep 2026 the assistant said the
--   current year is 2027-2028. It is 2026-2027.
--
-- FIX: among the institution's active years, pick in this order
--   1. the year whose start_date..end_date contains today (IST);
--   2. otherwise the latest year that has already started (covers the
--      April–May gap between one year's end_date and the next start_date);
--   3. otherwise the earliest upcoming year.
--   Ties on start_date (e.g. an '… Additional 2' shadow row) break to the
--   plain year, then name, then id — never on storage order.
--   Everything else in the body — identity pin, super-admin meaning of NULL,
--   role_has_institution_access check, NO_INSTITUTION answer — is unchanged.
--
-- Built from the LIVE body (md5(prosrc) ea25a9619c8d80a6674158eef0031275,
-- read 2026-09-28). The first DO block refuses to run if the live body is
-- neither that nor this file's result (3a1c6829337ba2b69f39862f2cb64275); the
-- last DO block checks the result after apply.
-- ============================================================================

DO $pre$
DECLARE v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = 'public.ai_rpc_academic_context(uuid)'::regprocedure;
  -- before = the live body this file was built from; after = what this file leaves.
  IF v_md5 IS DISTINCT FROM 'ea25a9619c8d80a6674158eef0031275'
     AND v_md5 IS DISTINCT FROM '3a1c6829337ba2b69f39862f2cb64275' THEN
    RAISE EXCEPTION '20270421090000: ai_rpc_academic_context drifted — live md5(prosrc) % is neither ea25a961… (built from) nor 3a1c6829… (this file''s result). Re-read pg_get_functiondef and rebuild.', v_md5;
  END IF;
END
$pre$;

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
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
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
  -- [current-year 2026-09-28] is_active means "not archived", not "current": 11 of 12
  -- institutions keep several years active. Pick the year containing today (IST), else the
  -- latest one already started, else the earliest upcoming one.
  SELECT * INTO v_academic_year
  FROM academic_years
  WHERE is_active = true
  AND ((COALESCE(v_profile.is_super_admin, FALSE) AND v_inst_id IS NULL) OR institution_id = v_inst_id)
  ORDER BY
    CASE
      WHEN start_date <= v_today AND (end_date IS NULL OR end_date >= v_today) THEN 0
      WHEN start_date <= v_today THEN 1
      ELSE 2
    END,
    CASE WHEN start_date <= v_today THEN start_date END DESC NULLS LAST,
    start_date ASC NULLS LAST,
    -- tie-break (two active rows with one start_date, e.g. an '… Additional 2' shadow row):
    -- the plain year first, then name, then id, so LIMIT 1 never depends on storage order.
    (academic_year_name ILIKE '%additional%') ASC,
    academic_year_name ASC,
    id ASC
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

-- Post-apply self-check: the body is exactly what this file wrote, and anon cannot run it.
DO $post$
DECLARE v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc
   WHERE oid = 'public.ai_rpc_academic_context(uuid)'::regprocedure;
  IF v_md5 IS DISTINCT FROM '3a1c6829337ba2b69f39862f2cb64275' THEN
    RAISE EXCEPTION '20270421090000: post-apply md5 % is not the expected 3a1c6829…', v_md5;
  END IF;
  IF has_function_privilege('anon', 'public.ai_rpc_academic_context(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '20270421090000: anon can still execute ai_rpc_academic_context';
  END IF;
END
$post$;
