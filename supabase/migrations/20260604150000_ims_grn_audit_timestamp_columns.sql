-- Migration: add received_at, verified_at, approved_at to ims_goods_received_notes
--
-- createGRN inserts received_at, verifyGRN updates verified_at, approveGRN updates
-- approved_at — none of these columns were created by any migration (only in
-- setup/01_tables.sql Phase F block which only runs on fresh installs).
-- PostgREST returns a 400 on INSERT/UPDATE for a non-existent column, surfaced
-- as "Failed to create GRN".

ALTER TABLE public.ims_goods_received_notes
  ADD COLUMN IF NOT EXISTS received_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;
