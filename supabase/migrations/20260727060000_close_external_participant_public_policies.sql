-- ============================================================================
-- SECURITY — close public access to external event participants
-- File: 20260727060000_close_external_participant_public_policies.sql
-- Date: 2026-07-27
--
-- APPLIED TO PRODUCTION 2026-07-27 ~05:55 IST with the Director's explicit
-- approval, ahead of this file, because it was a live personal-data exposure.
-- This migration records that change so a rebuild from scratch does not
-- reintroduce it. Re-running it is a no-op.
--
-- WHAT WAS EXPOSED
--   public.event_external_participants carried two policies granted TO public:
--     ext_participants_public_read    SELECT  USING (true)
--     ext_participants_public_insert  INSERT
--   The table holds full_name, email and phone for people who register for
--   events from outside the institution. Measured live: 9 rows, 9 names,
--   9 phone numbers. The read policy made every one of them readable by anyone
--   holding the public anon key — the key embedded in every page of
--   https://www.jkkn.ai. Confirmed over HTTPS, not inferred:
--     GET /rest/v1/event_external_participants?select=*  ->  HTTP 200
--   The insert policy additionally let any stranger write rows into event
--   registrations.
--
--   NOTE ON THE CLASS: this table has RLS ENABLED. It was exposed anyway,
--   because a permissive `TO public USING (true)` policy makes RLS a no-op.
--   An audit that greps for `relrowsecurity = false` — as the 2026-07-26 sweep
--   in 20260726180000 did — structurally cannot see this. 38 tables share the
--   shape; this was the only one holding personal data.
--
-- WHY REMOVING BOTH IS SAFE
--   Every access to this table in the codebase goes through
--   createServiceRoleClient(), which bypasses RLS entirely:
--     lib/services/events/core/external-participant-service.ts  (all queries)
--     app/api/events/marathon/[eventId]/register/route.ts       (registration)
--   Neither policy served the product. Registration continues to work because
--   it never depended on them. Verified after applying: read and insert as anon
--   both return HTTP 401, and all 9 rows are intact — access closed, no data
--   removed.
--
-- NOT DONE HERE (deliberate, Director's call 2026-07-27)
--   The other 37 tables with the same permissive-policy shape are left open.
--   They are aggregate internal data, not personal data — chiefly
--   institution_health_scores (2,086 rows) and feature_usage_summary (1,324).
--   `castes` (1,069) and `community_categories` (11) are VERIFIED-INTENTIONAL:
--   app/student-form/[token]/ reads both with the browser anon client, and that
--   form is opened by prospective applicants who have no account. Closing them
--   would break admission for every new applicant.
-- ============================================================================

DROP POLICY IF EXISTS "ext_participants_public_read"   ON public.event_external_participants;
DROP POLICY IF EXISTS "ext_participants_public_insert" ON public.event_external_participants;

-- Second layer: Supabase's default privileges also grant anon on every new
-- table. RLS alone should not be the only thing standing in the way.
REVOKE ALL ON TABLE public.event_external_participants FROM anon, PUBLIC;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'event_external_participants'
       AND 'public' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'a TO public policy still exists on event_external_participants';
  END IF;

  IF has_table_privilege('anon', 'public.event_external_participants'::regclass, 'SELECT') THEN
    RAISE EXCEPTION 'anon still holds SELECT on event_external_participants';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
