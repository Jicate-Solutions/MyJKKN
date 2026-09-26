-- ============================================================================
-- ai-rpc-meeting-bookings-rehearsal.sql                           (2026-09-26)
-- Checks for 20270402110000_ai_rpc_meeting_bookings_follow_rls.sql.
-- LOCAL PostgreSQL 16 only, on top of ai-rpc-meeting-bookings-stub-schema.sql
-- plus EITHER ai-rpc-meeting-bookings-pre-fix.sql (control: the live body —
-- the leak checks must FAIL) OR that plus the migration (every check PASSes).
-- NEVER run against production. Run as a superuser:
--   psql -v ON_ERROR_STOP=1 -f ai-rpc-meeting-bookings-rehearsal.sql
-- Each check prints PASS/FAIL; the last row is the summary.
-- ============================================================================

\set ON_ERROR_STOP on
RESET ROLE;

-- ---------------------------------------------------------------- seed ------
TRUNCATE public.meeting_bookings, public.jicate_booking_meeting_types,
         public.user_roles, public.custom_roles, public.profiles;

-- Colleges: A = ...0a1, B = ...0b1
INSERT INTO public.profiles (id, is_super_admin, institution_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000aa', true,  '00000000-0000-0000-0000-0000000000a1', 'super_admin'), -- SUPER
  ('00000000-0000-0000-0000-0000000000ad', false, '00000000-0000-0000-0000-0000000000a1', 'admin'),       -- ADMIN, college A
  ('00000000-0000-0000-0000-0000000000f1', false, '00000000-0000-0000-0000-0000000000a1', 'faculty'),     -- FACULTY non-host, A
  ('00000000-0000-0000-0000-0000000000f2', false, '00000000-0000-0000-0000-0000000000a1', 'staff'),       -- ALLSCOPE non-host
  ('00000000-0000-0000-0000-0000000000e1', false, '00000000-0000-0000-0000-0000000000a1', 'faculty'),     -- HOST1, college A
  ('00000000-0000-0000-0000-0000000000e2', false, '00000000-0000-0000-0000-0000000000b1', 'faculty'),     -- HOST2, college B
  ('00000000-0000-0000-0000-0000000000c0', false, '00000000-0000-0000-0000-0000000000a1', 'faculty');     -- NOPERM

INSERT INTO public.custom_roles (id, is_active, permissions, institution_scope) VALUES
  ('00000000-0000-0000-0000-000000000001', true, '{"meetings.view": true}',  'own'),  -- meetings.view, own college
  ('00000000-0000-0000-0000-000000000002', true, '{"meetings.view": true}',  'all'),  -- meetings.view, every college
  ('00000000-0000-0000-0000-000000000003', true, '{"attendance.view": true}', 'own'); -- no meetings.view

INSERT INTO public.user_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000003');

INSERT INTO public.jicate_booking_meeting_types (id, display_name) VALUES
  ('00000000-0000-0000-0000-0000000d0001', 'Parent meeting');

-- Six bookings. HOST1 hosts a1, a2 (college A) and b1 (college B — hosted
-- across colleges); HOST2 hosts b2, b3 (college B); a third host (no profile)
-- hosts a3 in college A.
INSERT INTO public.meeting_bookings (id, meeting_type_id, host_profile_id, institution_id, attendee_name, attendee_email, start_time, end_time, status) VALUES
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Visitor A1', 'a1@x.test', '2026-09-01 10:00+05:30', '2026-09-01 10:30+05:30', 'confirmed'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Visitor A2', 'a2@x.test', '2026-09-02 10:00+05:30', '2026-09-02 10:30+05:30', 'cancelled'),
  ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000a1', 'Visitor A3', 'a3@x.test', '2026-09-03 10:00+05:30', '2026-09-03 10:30+05:30', 'confirmed'),
  ('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Visitor B1', 'b1@x.test', '2026-09-04 10:00+05:30', '2026-09-04 10:30+05:30', 'confirmed'),
  ('00000000-0000-0000-0000-0000000b0005', NULL,                                   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'Visitor B2', 'b2@x.test', '2026-09-05 10:00+05:30', '2026-09-05 10:30+05:30', 'confirmed'),
  ('00000000-0000-0000-0000-0000000b0006', NULL,                                   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'Visitor B3', 'b3@x.test', '2026-09-06 10:00+05:30', '2026-09-06 10:30+05:30', 'confirmed');

-- ------------------------------------------------------------- helpers ------
DROP TABLE IF EXISTS public.rh_results;
CREATE TABLE public.rh_results (n serial, check_name text, expected text, got text, ok boolean);
GRANT ALL ON public.rh_results TO authenticated, anon;
GRANT ALL ON SEQUENCE public.rh_results_n_seq TO authenticated, anon;

-- Call the lookup as `uid` (JWT subject), passing `p_as` as p_user_id.
-- Returns the attendee emails it listed, sorted and comma-joined, or the
-- error code when it refused.
CREATE OR REPLACE FUNCTION public.rh_fn(uid uuid, p_as uuid DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text, ''), true);
  r := public.ai_rpc_meeting_bookings(p_as, p_status);
  IF NOT (r->>'success')::boolean THEN RETURN 'ERR:' || (r->'error'->>'code'); END IF;
  RETURN COALESCE((SELECT string_agg(e->>'attendee_email', ',' ORDER BY e->>'attendee_email')
                   FROM jsonb_array_elements(r->'data') e), '');
END $$;

-- What the table's own RLS (mb_host_select) shows `uid`.
CREATE OR REPLACE FUNCTION public.rh_rls(uid uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text, ''), true);
  RETURN COALESCE((SELECT string_agg(attendee_email, ',' ORDER BY attendee_email) FROM public.meeting_bookings), '');
END $$;
GRANT EXECUTE ON FUNCTION public.rh_fn(uuid, uuid, text), public.rh_rls(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rh_check(p_name text, p_expected text, p_got text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.rh_results (check_name, expected, got, ok)
  VALUES (p_name, p_expected, p_got, p_expected IS NOT DISTINCT FROM p_got)
$$;
GRANT EXECUTE ON FUNCTION public.rh_check(text, text, text) TO authenticated, anon;

-- --------------------------------------------------------------- checks -----
\o /dev/null
SET ROLE authenticated;

-- (a) a non-host team member sees nobody else's bookings
SELECT public.rh_check('a1 FACULTY non-host (own-scope meetings.view) sees 0 bookings', '',
  public.rh_fn('00000000-0000-0000-0000-0000000000f1'));
SELECT public.rh_check('a2 ALLSCOPE non-host (scope=all meetings.view) sees 0 bookings', '',
  public.rh_fn('00000000-0000-0000-0000-0000000000f2'));
SELECT public.rh_check('a3 FACULTY answer == what RLS gives FACULTY on the table',
  public.rh_rls('00000000-0000-0000-0000-0000000000f1'),
  public.rh_fn('00000000-0000-0000-0000-0000000000f1'));
SELECT public.rh_check('a4 ALLSCOPE answer == what RLS gives ALLSCOPE on the table',
  public.rh_rls('00000000-0000-0000-0000-0000000000f2'),
  public.rh_fn('00000000-0000-0000-0000-0000000000f2'));

-- (b) a host still sees their own bookings — all of them, and only them
SELECT public.rh_check('b1 HOST1 sees exactly own bookings a1,a2,b1 (b1 is in another college)', 'a1@x.test,a2@x.test,b1@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000e1'));
SELECT public.rh_check('b2 HOST2 sees exactly own bookings b2,b3', 'b2@x.test,b3@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000e2'));
SELECT public.rh_check('b3 HOST1 answer == what RLS gives HOST1 on the table',
  public.rh_rls('00000000-0000-0000-0000-0000000000e1'),
  public.rh_fn('00000000-0000-0000-0000-0000000000e1'));
SELECT public.rh_check('b4 HOST2 answer == what RLS gives HOST2 on the table',
  public.rh_rls('00000000-0000-0000-0000-0000000000e2'),
  public.rh_fn('00000000-0000-0000-0000-0000000000e2'));
SELECT public.rh_check('b5 status filter only narrows: HOST1 + cancelled = a2', 'a2@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000e1', NULL, 'cancelled'));

-- (c) admin and super admin unchanged
SELECT public.rh_check('c1 SUPER sees every booking', 'a1@x.test,a2@x.test,a3@x.test,b1@x.test,b2@x.test,b3@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000aa'));
SELECT public.rh_check('c2 ADMIN (own college A) sees college A bookings, as before', 'a1@x.test,a2@x.test,a3@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000ad'));
SELECT public.rh_check('c3 NOPERM still refused', 'ERR:FORBIDDEN',
  public.rh_fn('00000000-0000-0000-0000-0000000000c0'));
SELECT public.rh_check('c4 no session still refused', 'ERR:UNAUTHORIZED',
  public.rh_fn(NULL));

-- (e) caller-supplied p_user_id is ignored
SELECT public.rh_check('e1 FACULTY passing SUPER as p_user_id still sees 0', '',
  public.rh_fn('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000aa'));
SELECT public.rh_check('e2 HOST2 passing HOST1 as p_user_id still sees only own', 'b2@x.test,b3@x.test',
  public.rh_fn('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1'));

RESET ROLE;

-- (d) anon cannot execute
SELECT public.rh_check('d1 anon has no EXECUTE on ai_rpc_meeting_bookings', 'false',
  has_function_privilege('anon', 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)', 'EXECUTE')::text);
SELECT public.rh_check('d2 PUBLIC has no EXECUTE (no =X/ entry in the ACL)', 'false',
  (SELECT COALESCE(proacl::text LIKE '%{=X/%' OR proacl::text LIKE '%,=X/%', true)::text
   FROM pg_proc WHERE oid = 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)'::regprocedure));
SET ROLE anon;
DO $anon$
DECLARE got text;
BEGIN
  BEGIN
    PERFORM public.ai_rpc_meeting_bookings(NULL);
    got := 'executed';
  EXCEPTION WHEN insufficient_privilege THEN
    got := 'permission denied';
  END;
  PERFORM public.rh_check('d3 anon calling the function is refused by Postgres', 'permission denied', got);
END $anon$;
RESET ROLE;
SELECT public.rh_check('d4 authenticated keeps EXECUTE', 'true',
  has_function_privilege('authenticated', 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)', 'EXECUTE')::text);

-- --------------------------------------------------------------- report -----
\o
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, check_name, expected, got
FROM public.rh_results ORDER BY n;

SELECT 'SUMMARY' AS result,
       count(*) FILTER (WHERE ok)     AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.ai_rpc_meeting_bookings(uuid,text,text,text,integer,integer)'::regprocedure) AS body_md5
FROM public.rh_results;
