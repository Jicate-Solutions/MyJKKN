-- ============================================================================
-- 20270402110000_ai_rpc_meeting_bookings_follow_rls.sql
-- ----------------------------------------------------------------------------
-- AI assistant: the meeting-bookings lookup now shows exactly the bookings the
-- meeting_bookings table's own RLS shows, and no more.            (2026-09-26)
--
-- FILE ONLY. NOT APPLIED. Apply only on the Director's yes. The first block
-- below REFUSES to run if the live function differs from what this file was
-- built from (md5 below).
--
-- WHAT WAS WRONG (verified live, read-only, 2026-09-26)
--   public.ai_rpc_meeting_bookings is SECURITY DEFINER, so the table's RLS
--   never runs inside it. It scoped rows by INSTITUTION only:
--       WHERE (v_all OR b.institution_id = v_inst)
--   while the table's only SELECT policy, mb_host_select, admits
--       (SELECT is_super_admin()) OR (SELECT is_admin())
--       OR host_profile_id = (SELECT auth.uid())
--   So any team member holding meetings.view (944 people live) received every
--   booking in their college — attendee names and emails of meetings hosted
--   by someone else — and the 160 people whose meetings.view role is
--   institution_scope='all' received all 274 bookings. The same person reading
--   meeting_bookings directly through PostgREST gets 0 rows.
--
-- WHAT CHANGES
--   Only the row rule. A booking is returned when:
--     * the caller is a super admin (profiles.is_super_admin)  — every booking,
--       as before;
--     * the caller is an admin (public.is_admin(): is_super_admin OR
--       profiles.role IN ('admin','super_admin','administrator')) — bookings in
--       their college, or every college with an institution_scope='all'
--       meetings.view role, exactly as before (narrower than the policy, kept
--       so admins see no change);
--     * the caller is the booking's host (host_profile_id = auth.uid()) — all
--       of their own bookings.
--   Everyone else now gets an empty list (success:true, total_count 0), the
--   same answer the table gives them.
--   mb_host_select has no co-host / delegate arm (live pg_policies, 2026-09-26:
--   it is the ONLY policy on the table), so none is added here.
--
-- UNCHANGED
--   Signature, defaults, SET options, output keys and SELECT list; identity is
--   auth.uid() only (p_user_id stays ignored); the meetings.view permission
--   gate and its FORBIDDEN answer; the UNAUTHORIZED answer for no session;
--   the status / date filters (they only narrow).
--   Grants: anon and PUBLIC revoked, authenticated granted (service_role keeps
--   the grant it already has — CREATE OR REPLACE preserves the ACL).
--
-- MD5 RE-CHECK — md5(prosrc)
--   before (live 2026-09-26): d6e4989b8923dfa57c340da538419118
--   after  (this file)      : 4bb73a1815e35407285785b4b6966dbb
--
-- PROOF (local PostgreSQL 16, never production):
--   supabase/tests/ai-rpc-meeting-bookings-stub-schema.sql  (live columns + helpers)
--   supabase/tests/ai-rpc-meeting-bookings-pre-fix.sql      (live body, verbatim)
--   supabase/tests/ai-rpc-meeting-bookings-rehearsal.sql    (checks; FAIL on the
--                                                            live body, PASS here)
-- ============================================================================

DO $pre$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p
  WHERE p.oid = 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)'::regprocedure;

  IF v_md5 IS DISTINCT FROM 'd6e4989b8923dfa57c340da538419118'
     AND v_md5 IS DISTINCT FROM '4bb73a1815e35407285785b4b6966dbb' THEN
    RAISE EXCEPTION '20270402110000: ai_rpc_meeting_bookings drifted — live md5(prosrc) % is neither % (what this file was built from) nor % (what it leaves). Re-read pg_get_functiondef and rebuild this file.',
      v_md5, 'd6e4989b8923dfa57c340da538419118', '4bb73a1815e35407285785b4b6966dbb';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.ai_rpc_meeting_bookings(p_user_id uuid, p_status text DEFAULT NULL::text, p_date_from text DEFAULT NULL::text, p_date_to text DEFAULT NULL::text, p_limit integer DEFAULT 10000, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_super boolean; v_admin boolean; v_inst uuid; v_all boolean; v_ok boolean; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),
    'actions_available','[]'::jsonb,'error',jsonb_build_object('code','UNAUTHORIZED','message','Sign in required.')); END IF;
  SELECT COALESCE(is_super_admin,false), institution_id INTO v_super, v_inst FROM profiles WHERE id = v_uid;
  v_ok := COALESCE(v_super,false) OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true)
              AND lower(COALESCE(cr.permissions->>'meetings.view','')) IN ('true','t','1'));
  IF NOT COALESCE(v_ok,false) THEN RETURN jsonb_build_object('success',false,'data','[]'::jsonb,
    'metadata',jsonb_build_object('total_count',0,'returned_count',0,'has_more',false),'actions_available','[]'::jsonb,
    'error',jsonb_build_object('code','FORBIDDEN','message','Needs meetings.view to view meeting bookings.')); END IF;
  -- Rows follow the table's SELECT policy mb_host_select (live 2026-09-26):
  --   is_super_admin() OR is_admin() OR host_profile_id = auth.uid().
  -- Admins keep the institution narrowing they always had; a host sees their own
  -- bookings; nobody else sees other people's bookings.
  v_super := COALESCE(v_super,false);
  v_admin := v_super OR COALESCE(public.is_admin(v_uid),false);
  -- cross-institution ONLY via a role that grants THIS permission AND is scope='all'
  -- (permission+scope must come from the SAME role — deep-review r3 decoupling fix)
  v_all := v_super OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id
            WHERE ur.user_id=v_uid AND COALESCE(cr.is_active,true) AND cr.institution_scope='all'
              AND lower(COALESCE(cr.permissions->>'meetings.view','')) IN ('true','t','1'));
  WITH base AS (
    SELECT b.id, b.attendee_name, b.attendee_email, mt.display_name AS meeting_type, b.start_time, b.end_time, b.status
    FROM meeting_bookings b
    LEFT JOIN jicate_booking_meeting_types mt ON mt.id = b.meeting_type_id
    WHERE (v_super
           OR (v_admin AND (v_all OR b.institution_id = v_inst))
           OR b.host_profile_id = v_uid)
      AND (p_status IS NULL OR b.status::text = p_status)
      AND (p_date_from IS NULL OR trim(p_date_from) !~ '^\d{4}-\d{2}-\d{2}$' OR (b.start_time AT TIME ZONE 'Asia/Kolkata')::date >= (CASE WHEN trim(p_date_from) ~ '^\d{4}-\d{2}-\d{2}$' THEN trim(p_date_from)::date END))
      AND (p_date_to IS NULL OR trim(p_date_to) !~ '^\d{4}-\d{2}-\d{2}$' OR (b.start_time AT TIME ZONE 'Asia/Kolkata')::date <= (CASE WHEN trim(p_date_to) ~ '^\d{4}-\d{2}-\d{2}$' THEN trim(p_date_to)::date END)))
  , paged AS (SELECT * FROM base ORDER BY start_time DESC, id DESC LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('success',true,'data',COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb) FROM paged p),'[]'::jsonb),
    'metadata',jsonb_build_object('total_count',(SELECT COUNT(*) FROM base),'returned_count',(SELECT COUNT(*) FROM paged),
      'has_more',(SELECT COUNT(*) FROM base) > (GREATEST(p_offset,0)+(SELECT COUNT(*) FROM paged))),
    'actions_available','[]'::jsonb) INTO v_result;
  RETURN v_result;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer) TO authenticated;

-- Apply-time self-check: the body is the one this file ships and anon cannot run it.
DO $post$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p
  WHERE p.oid = 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)'::regprocedure;
  IF v_md5 IS DISTINCT FROM '4bb73a1815e35407285785b4b6966dbb' THEN
    RAISE EXCEPTION '20270402110000: after apply md5(prosrc) is %, expected %', v_md5, '4bb73a1815e35407285785b4b6966dbb';
  END IF;
  IF has_function_privilege('anon', 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '20270402110000: anon can still execute ai_rpc_meeting_bookings';
  END IF;
END
$post$;
