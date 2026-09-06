-- ============================================================================
-- SECURITY — revoke anon on four tables added 2026-07-26
-- File: 20260726210000_revoke_anon_on_four_new_public_tables.sql
-- Date: 2026-07-26
--
-- WHAT WAS FOUND (verified live on prod kvizhngldtiuufknvehv, 2026-07-26)
--   Four tables created on 2026-07-26 carry Supabase's full default grant to
--   `anon` and nobody revoked it:
--
--     relacl = {postgres=arwdDxt/postgres, anon=arwdDxt/postgres,
--               authenticated=arwdDxt/postgres, service_role=arwdDxt/postgres}
--
--     sustainability_meter_readings     RLS on, 4 policies
--     sustainability_naac_evidence      RLS on, 1 policy  (SELECT only)
--     accreditation_meeting_drafts      RLS on, 1 policy  (SELECT only)
--     accreditation_meeting_proposals   RLS on, 1 policy  (SELECT only)
--
--   `arwdDxt` is SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
--   granted to the anon key that is embedded in every page of
--   https://www.jkkn.ai. The two source migrations
--   (20260726181500_accreditation_committee_ai_assistant.sql and
--   20260803060000_sustainability_meter_readings_and_evidence.sql) each DO
--   contain `REVOKE EXECUTE ... FROM anon` lines — but only on FUNCTIONS.
--   Neither contains a single `REVOKE ... ON TABLE ... FROM anon`.
--
-- WHY THIS IS NOT ALREADY AN OPEN DOOR — AND WHY THAT IS NOT REASSURING
--   PostgREST currently answers 401 for all four. The reason is NOT the ACL and
--   NOT the row-security policy. Measured over HTTPS with the public anon key:
--
--     GET /rest/v1/sustainability_meter_readings
--     -> 401 {"code":"42501","message":
--             "permission denied for function user_has_permission"}
--
--   compare a genuinely locked table:
--
--     GET /rest/v1/_bak_hostel_allocations_20260612
--     -> 401 {"code":"42501","message":
--             "permission denied for table _bak_hostel_allocations_20260612"}
--
--   Every policy on these four is `TO PUBLIC` (pg_policy.polroles = {0}), so it
--   DOES apply to anon and Postgres DOES evaluate it. anon already holds EXECUTE
--   on is_super_admin(), is_admin(uuid) and role_has_institution_access(uuid);
--   evaluation walks past all of those and dies only at user_has_permission(text),
--   the one helper anon happens to lack. So the sole thing keeping these four
--   private today is a missing EXECUTE grant on ONE function. Any policy
--   rewritten without that helper, or any future migration granting anon EXECUTE
--   on it, opens all four silently — with no migration touching these tables.
--   The table-level revoke below is the defence that does not depend on that.
--
-- WHAT THIS DOES
--   REVOKE ALL ... FROM anon, PUBLIC on each of the four. That is the check
--   PostgREST performs first, before any row-security evaluation.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   - It does not touch `authenticated` or `service_role`. Both hold their own
--     direct grants (relacl above shows no PUBLIC entry at all, so the PUBLIC
--     revoke is a no-op today and exists only to defend against a future PUBLIC
--     grant). Every caller of these tables is authenticated or service-role:
--       lib/services/accreditation/utility-readings-service.ts   (browser client, session)
--       lib/services/accreditation/committee-meeting-service.ts  (browser client, session)
--       app/(routes)/accreditation/naac/committees/[id]/_actions/meeting-ai-actions.ts
--       app/api/cron/sustainability-naac-evidence/route.ts        (service role)
--     None of them reads these tables unauthenticated, so this is a no-behaviour-
--     change migration for the product.
--   - It does not add, drop or alter a single RLS policy. All four already have
--     RLS enabled; the assert below FAILS if that ever drifted off, rather than
--     silently re-enabling it.
--   - It does not touch the ~1,300 other tables that carry anon grants but have
--     RLS on. Those need their own judgement call (see the PR's "Found but NOT
--     fixed" section — 22 of them are currently readable by anon over HTTPS).
-- ============================================================================

REVOKE ALL ON TABLE public.sustainability_meter_readings   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sustainability_naac_evidence    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.accreditation_meeting_drafts    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.accreditation_meeting_proposals FROM anon, PUBLIC;

-- ----------------------------------------------------------------------------
-- Apply-time assert — fail loudly rather than leaving anything public, and fail
-- loudly if the revoke overshot and took `authenticated` or `service_role` with
-- it (that would break the utility-readings page and the nightly evidence cron).
--
-- has_table_privilege takes the OID form, NOT the text form: the text form
-- resolves the relation name through search_path and Postgres does not guarantee
-- it is evaluated AFTER the nspname filter. c.oid cannot misresolve. (This bit
-- migration 20260726180000 live during its own validation.)
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_names   text[] := ARRAY[
    'sustainability_meter_readings',
    'sustainability_naac_evidence',
    'accreditation_meeting_drafts',
    'accreditation_meeting_proposals'
  ];
  v_found   int;
  v_anon    int;
  v_lost    int;
  v_rlsoff  int;
BEGIN
  SELECT count(*) INTO v_found
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (v_names);
  IF v_found <> array_length(v_names, 1) THEN
    RAISE EXCEPTION 'expected % target tables in schema public, found %',
      array_length(v_names, 1), v_found;
  END IF;

  SELECT count(*) INTO v_anon
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (v_names)
     AND (has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'anon still holds a table privilege on % of the target tables', v_anon;
  END IF;

  SELECT count(*) INTO v_lost
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (v_names)
     AND NOT (has_table_privilege('authenticated', c.oid, 'SELECT')
              AND has_table_privilege('service_role', c.oid, 'SELECT'));
  IF v_lost > 0 THEN
    RAISE EXCEPTION 'authenticated or service_role lost SELECT on % table(s) — the revoke overshot', v_lost;
  END IF;

  SELECT count(*) INTO v_rlsoff
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (v_names)
     AND NOT c.relrowsecurity;
  IF v_rlsoff > 0 THEN
    RAISE EXCEPTION 'RLS is disabled on % target table(s) — expected all four RLS-enabled', v_rlsoff;
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
