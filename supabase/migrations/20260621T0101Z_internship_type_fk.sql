-- =====================================================================
-- internship_assignments.internship_type → cdc_internship_types FK
-- =====================================================================
-- Date: 2026-06-21
-- Bug: BUG-004060 (config-master migration of the internship_type value-list)
-- Depends on: 20260621T0100Z_cdc_config_masters.sql (creates + seeds
--             cdc_internship_types). This file is timestamped AFTER so the
--             master table and its four seed rows exist before the backfill.
--
-- Director decision: "Add FK + migrate every row."
--   1. Add a nullable internship_type_id FK referencing the new master.
--   2. Backfill it for every existing row by matching the legacy enum
--      column to the master's config_key.
--   3. KEEP the legacy internship_type ENUM column (back-compat for
--      existing reads; deprecate + drop in a later phase once all
--      consumers read internship_type_id).
--
-- IMPORTANT — enum vs text join:
--   internship_assignments.internship_type is the public.cdc_internship_type
--   ENUM, while cdc_internship_types.config_key is text. Postgres will not
--   implicitly compare enum = text, so the join casts the enum to text:
--   a.internship_type::text = t.config_key. The 0100Z seed guarantees a
--   config_key exists for all four enum labels, so every row resolves.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, UPDATE only fills NULLs).
-- NOT applied to prod here.
-- =====================================================================

BEGIN;

-- 1. Add the FK column. ON DELETE SET NULL so deleting a master row never
--    cascades into deleting assignment history — it just unlinks.
ALTER TABLE public.internship_assignments
  ADD COLUMN IF NOT EXISTS internship_type_id uuid
  REFERENCES public.cdc_internship_types(id) ON DELETE SET NULL;

-- 2. Backfill every existing row by matching the legacy enum to config_key.
--    a.internship_type is the cdc_internship_type ENUM → cast to text.
--    Only fills rows where internship_type_id is still NULL (idempotent rerun).
UPDATE public.internship_assignments a
SET    internship_type_id = t.id
FROM   public.cdc_internship_types t
WHERE  t.config_key = a.internship_type::text
  AND  a.internship_type_id IS NULL;

-- 3. Document both columns: the legacy enum is retained for back-compat,
--    the new FK is the forward-looking source of truth.
COMMENT ON COLUMN public.internship_assignments.internship_type IS
  'DEPRECATED (kept for back-compat): legacy cdc_internship_type ENUM. Read internship_type_id (FK to cdc_internship_types) for new code. Will be dropped in a later phase once all consumers migrate.';

COMMENT ON COLUMN public.internship_assignments.internship_type_id IS
  'FK to cdc_internship_types (the CRUDable config-master). Backfilled 2026-06-21 from the legacy internship_type ENUM. Forward-looking source of truth for internship type.';

COMMIT;
