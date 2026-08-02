-- =============================================================================
-- 20260731220000_add_session_feedback_faculty_email_lower_index.sql
-- RECORD of an index ALREADY APPLIED TO PROD — this file has ZERO runtime effect.
-- =============================================================================
-- APPLIED LIVE: 2026-07-31 ~07:55 IST (Director-approved) via the Management API
-- as a SINGLE-STATEMENT `CREATE INDEX CONCURRENTLY` outside any transaction
-- (CONCURRENTLY cannot run inside a transaction block). The exact live DDL was:
--
--   CREATE INDEX CONCURRENTLY idx_session_feedback_faculty_email_lower
--     ON public.session_feedback (lower(faculty_email), attendance_date);
--
-- VERIFIED after apply:
--   * pg_index.indisvalid = true for the new index
--   * EXPLAIN on a lower(faculty_email) filter switched from Seq Scan
--     (cost ~7127) to Bitmap Index Scan (cost ~657)
--
-- This file exists so the repo is not amnesiac about production schema — the
-- migrations replay workflow is NEVER run against prod (deploys ship code, not
-- migrations), so this is the durable record only. The statement below is
-- idempotent (IF NOT EXISTS, without CONCURRENTLY) so a from-scratch environment
-- builds the same index; on production it is a no-op.
--
-- Sibling index: idx_session_feedback_faculty (faculty_email, attendance_date)
-- from 20260615233000_session_feedback_substrate.sql serves exact-case lookups;
-- this one serves the case-insensitive join path
-- (lower(faculty_email) = lower($1)) used to match the attendance blob's
-- assigned_faculty.faculty_email against profiles.email.

CREATE INDEX IF NOT EXISTS idx_session_feedback_faculty_email_lower
  ON public.session_feedback (lower(faculty_email), attendance_date);
