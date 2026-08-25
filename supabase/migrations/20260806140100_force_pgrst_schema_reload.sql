-- =====================================================================
-- Force PostgREST to rebuild its schema cache
-- =====================================================================
-- Companion to 20260806140000_staff_biometric_drop_institution_fk.sql.
--
-- Dropping staff_biometric_institution_id_fkey fixed the database instantly —
-- pg_constraint showed a single FK to institutions — but PostgREST kept serving
-- the stale relationship and carried on raising PGRST201 on every
-- staff -> institutions embed. The error even named a constraint that no longer
-- existed anywhere in the schema, which is the tell that the cache, not the
-- schema, is wrong.
--
-- The first reload attempt was issued through the Supabase MCP's execute_sql,
-- which does not commit. NOTIFY is TRANSACTIONAL: the notification is only
-- delivered when the sending transaction commits, so it was discarded and the
-- listener never woke. Running it as a migration commits, and the no-op COMMENT
-- additionally fires the pgrst_ddl_watch event trigger.
--
-- Verified after this ran: the exact staff select from
-- lib/services/staff/staff-service.ts:526 (`*` plus the category, institution
-- and department embeds) returns HTTP 206 with data, and 20 consecutive
-- requests through the public edge with the anon key all resolved — no stale
-- replica.
-- =====================================================================

COMMENT ON TABLE public.staff IS 'Staff master. One row per employee; staff.id is the identity every HR module keys on.';

NOTIFY pgrst, 'reload schema';
