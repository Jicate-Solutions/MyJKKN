-- Migration: 20260227_add_missing_ims_items_columns
-- Purpose:
--   Add hsn_code, gst_rate, and created_by to ims_items.
--   These columns are present in the TypeScript ImsItem type and the import
--   route but were never applied to the database, causing PGRST204 errors.
--
--   All three are nullable / have defaults for backward compatibility.

ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS hsn_code   TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
