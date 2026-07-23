-- ============================================================================
-- campus_living_recognition — revoke anon/PUBLIC table grants
-- ============================================================================
-- Date: 2026-06-12. APPLIED LIVE via exec_sql same day (verified: anon table
-- read 42501/HTTP 401; authenticated read + feed RPC unaffected). This file
-- records the applied state so replays (staging) match prod.
--
-- Why: Supabase default-grants every new table to anon. The keystone table's
-- SELECT policy has an `is_public` arm with no role restriction — intended
-- for signed-in residents' "Hostel wins" feed, NOT the internet. Without this
-- revoke, anon could read public recognition rows (titles + learner UUIDs)
-- directly off the table even though the feed RPC is anon-revoked.
-- Companion to migration 20260612003000_campus_living_recognition_keystone.sql.
-- ============================================================================

REVOKE ALL ON public.campus_living_recognition FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
