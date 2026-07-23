-- Migration: add rejected_by and rejected_at columns to ims_indent_requests
--
-- The rejectIndent service method writes to these two columns, but the original
-- 20260514_port_ims_schema_from_roja_ims migration never created them. This caused
-- a PostgREST 400 error on every rejection attempt ("Failed to reject indent").
-- setup/01_tables.sql already contains the equivalent ADD COLUMN IF NOT EXISTS
-- block (Phase F section) but that only runs on fresh installs, not live DBs.

ALTER TABLE public.ims_indent_requests
  ADD COLUMN IF NOT EXISTS rejected_by  UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at  TIMESTAMPTZ;
