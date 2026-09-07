-- 20260927010000_rescope_service_role_insert_policies.sql
--
-- WHAT THIS CHANGES
--   Four INSERT policies are NAMED for service_role / "system" but were granted
--   TO public with WITH CHECK (true) -- so any caller holding the table's INSERT
--   grant (anon does) can blind-insert forged rows. Each is re-scoped to the
--   service_role role only (DROP + CREATE, so it is idempotent and rebuild-safe).
--
--     table                          policy (dropped -> recreated TO service_role)
--     ------------------------------ -------------------------------------------
--     admission_counselor_duty_log   duty_log_insert_service_role
--     module_usage_daily             Service role can insert module_usage_daily
--     telephony_sync_metadata        sync_metadata_insert_service
--     user_activity_logs             System can insert activity logs
--
-- WHY  (VERIFIED READ-ONLY AGAINST PRODUCTION 2026-08-25)
--   pg_policies: each policy above is cmd=INSERT, roles={public}, with_check
--   'true'. role_table_grants: anon holds INSERT on all four tables. Both layers
--   are therefore open to anon today. service_role has rolbypassrls=true, so the
--   legitimate server-side writers (all createServiceRoleClient()) keep working.
--   No write-test was run against production -- correctness is argued from the
--   policy definitions and grants, never by inserting a forged row.
--
--   Writer audit (why each is SAFE to re-scope to service_role):
--     admission_counselor_duty_log -- app/api/cron/duty-log-retention/route.ts
--       and app/api/admission/counselors/[id]/route.ts, both service-role.
--     module_usage_daily -- app/api/cron/usage-rollup/route.ts, service-role;
--       the analytics services only READ this table.
--     telephony_sync_metadata -- written via InboundCallSyncService, whose only
--       callers (app/api/telephony/inbound-sync, app/api/cron/sync-inbound-calls)
--       pass createServiceRoleClient(); telephony-service.ts is also service-role.
--     user_activity_logs -- has a SECOND, surviving INSERT policy
--       activity_logs_insert_own (WITH CHECK user_id = auth.uid()), which is the
--       path the browser client (lib/utils/activity-logger-client.ts) uses to
--       write a signed-in user's OWN rows. anon cannot satisfy auth.uid(), so
--       re-scoping only the blind "System" policy closes anon while leaving own-
--       row writes intact.
--
-- TABLES DELIBERATELY NOT CHANGED  (reported in the audit but NOT confirmed safe:
-- each is written by a browser / authenticated client that RELIES on the blind
-- policy, so re-scoping to service_role would break them on merge)
--     communication_cost_log   -- CommunicationCostService inserts via the
--                                 browser client (createClientSupabaseClient).
--     usage_events             -- lib/navigation/search-analytics.ts inserts via
--                                 the browser client (command-palette search).
--     profile_change_audit_log -- learner-profile-audit-service.ts inserts via
--                                 the authenticated server client (createClient,
--                                 NOT service-role).
--   Closing these needs a companion is-owner / authenticated policy or moving the
--   write server-side -- out of scope for this posture-only PR; Director follow-up.
--   admission_form_events and the marathon_* / event_* "*_public_insert" policies
--   were reviewed and left alone (intentionally public form / check-in writes,
--   not service-role-named). public.saml_sessions ("Service can create sessions")
--   is SSO-session-coupled and left for Director review rather than blind-changed.
--
-- BLAST RADIUS
--   For each of the four: anon / authenticated lose the blind INSERT path (the
--   fix); service_role writers unaffected (bypassrls); user_activity_logs own-row
--   browser writes unaffected via activity_logs_insert_own. RLS is enabled on all
--   four tables (verified).
--
-- WHAT COULD NOT BE VERIFIED
--   Not applied, so the post-state was not observed. Policy names / roles /
--   with_check and the anon INSERT grants were verified live against production.
--
-- 🛑 STAGING-FIRST -- do not apply to prod until tested on a clone.
--    FILE ONLY / NOT APPLIED -- Director-gated.

-- admission_counselor_duty_log
DROP POLICY IF EXISTS "duty_log_insert_service_role" ON public.admission_counselor_duty_log;
CREATE POLICY "duty_log_insert_service_role" ON public.admission_counselor_duty_log
  FOR INSERT TO service_role WITH CHECK (true);

-- module_usage_daily
DROP POLICY IF EXISTS "Service role can insert module_usage_daily" ON public.module_usage_daily;
CREATE POLICY "Service role can insert module_usage_daily" ON public.module_usage_daily
  FOR INSERT TO service_role WITH CHECK (true);

-- telephony_sync_metadata
DROP POLICY IF EXISTS "sync_metadata_insert_service" ON public.telephony_sync_metadata;
CREATE POLICY "sync_metadata_insert_service" ON public.telephony_sync_metadata
  FOR INSERT TO service_role WITH CHECK (true);

-- user_activity_logs  (activity_logs_insert_own is left in place, untouched)
DROP POLICY IF EXISTS "System can insert activity logs" ON public.user_activity_logs;
CREATE POLICY "System can insert activity logs" ON public.user_activity_logs
  FOR INSERT TO service_role WITH CHECK (true);
