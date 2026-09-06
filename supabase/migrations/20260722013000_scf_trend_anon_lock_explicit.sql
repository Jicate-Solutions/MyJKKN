-- Migration: 20260722013000_scf_trend_anon_lock_explicit.sql
-- Purpose: House-standard tidy-up. PR #2231 re-defined fn_scf_downward_trend_all
--   (a SECURITY DEFINER function) via CREATE OR REPLACE without the explicit
--   anon-lock block, so the "New SECURITY DEFINER functions lock anon" CI gate
--   flagged it. The runtime was never exposed — CREATE OR REPLACE preserves an
--   existing function's grants, and this function has always had anon revoked
--   (verified on prod: anon=false, authenticated=true, service_role=true) — but
--   the standing rule is that every SECDEF migration spells its access out
--   explicitly (audit-trail signal, not a Supabase default).
--
-- This migration adds ONLY the explicit privilege block. It defines no function
-- and changes no behaviour — it re-asserts the grants the function already holds.
-- Idempotent and safe to apply any number of times.

REVOKE EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_downward_trend_all(integer) TO authenticated, service_role;
