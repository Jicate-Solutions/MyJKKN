-- 20260515000010_resources_add_assignee_and_qr.sql
--
-- WAVE 1.5 PR-1 — substrate extension for HR-adapter approach (Workisy gap #6).
-- Replaces the closed PR #891 (Agent δ) `hr_assets` parallel infrastructure with
-- an extension to the canonical /resource-management/ stack.
--
-- TIER classification: TIER-0 safe-additive.
--   • Adds 5 columns to public.resources (all nullable / defaulted)
--   • Adds one composite index for fast (assignee_type, assignee_id) lookups
--   • Adds an INSERT trigger that auto-generates `qr_code_token` when caller
--     omits it (opaque token; PR-2 will add qrcode-lib rendering)
--   • Adds a CHECK constraint enforcing assignee_id-required-when-type≠'none'
--   • Backfills existing rows with assignee_type='none'
--   • Includes an inline DO $$ ... $$ smoke test that round-trips an INSERT
--     and asserts the trigger fired, then deletes the test row.
--
-- ROLLBACK
--   ALTER TABLE public.resources
--     DROP COLUMN IF EXISTS assignee_type,
--     DROP COLUMN IF EXISTS assignee_id,
--     DROP COLUMN IF EXISTS qr_code_token,
--     DROP COLUMN IF EXISTS assigned_at,
--     DROP COLUMN IF EXISTS returned_at;
--   DROP TRIGGER IF EXISTS trg_resources_set_qr_token ON public.resources;
--   DROP FUNCTION IF EXISTS tg_resources_set_qr_token();

BEGIN;

-- 1. Add columns (idempotent; uses IF NOT EXISTS)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS assignee_type TEXT
    CHECK (assignee_type IN ('staff','student','vendor','none'))
    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS assignee_id UUID NULL,
  ADD COLUMN IF NOT EXISTS qr_code_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ NULL;

-- 2. Unique constraint on qr_code_token (separate to allow NULL-safety across many rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resources_qr_code_token_key'
      AND conrelid = 'public.resources'::regclass
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_qr_code_token_key UNIQUE (qr_code_token);
  END IF;
END $$;

-- 3. CHECK constraint: assignee_id required when assignee_type is not 'none'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'resources_assignee_id_required_when_assigned'
      AND conrelid = 'public.resources'::regclass
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_assignee_id_required_when_assigned
      CHECK (assignee_type = 'none' OR assignee_id IS NOT NULL);
  END IF;
END $$;

-- 4. Index for fast lookups (e.g. /hr/my-assets WHERE assignee_type='staff' AND assignee_id=<me>)
CREATE INDEX IF NOT EXISTS idx_resources_assignee
  ON public.resources(assignee_type, assignee_id);

-- 5. Backfill existing rows (DEFAULT only fires for new INSERTs; explicit UPDATE for old rows)
UPDATE public.resources
SET assignee_type = 'none'
WHERE assignee_type IS NULL;

-- 6. Trigger function to auto-generate qr_code_token on INSERT when NULL
CREATE OR REPLACE FUNCTION public.tg_resources_set_qr_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.qr_code_token IS NULL THEN
    NEW.qr_code_token := 'res_' || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resources_set_qr_token ON public.resources;
CREATE TRIGGER trg_resources_set_qr_token
  BEFORE INSERT ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_resources_set_qr_token();

-- 7. Column documentation
COMMENT ON COLUMN public.resources.assignee_type IS 'Polymorphic discriminator: which entity is the resource currently assigned to (staff|student|vendor|none).';
COMMENT ON COLUMN public.resources.assignee_id IS 'UUID of the assignee — interpretation depends on assignee_type. NULL only when assignee_type=''none''.';
COMMENT ON COLUMN public.resources.qr_code_token IS 'Opaque token printed onto the physical QR sticker (e.g. res_<uuidhex>). Auto-generated via trigger on INSERT when not supplied. Used by /resource-management/scan to look up the resource.';
COMMENT ON COLUMN public.resources.assigned_at IS 'Timestamp of the most recent assignment (set by ResourceService.assignToStaff()).';
COMMENT ON COLUMN public.resources.returned_at IS 'Timestamp of the most recent return (set by ResourceService.markReturned()). Retained for history when subsequent assignments overwrite assigned_at.';

COMMIT;

-- 8. Inline smoke test — round-trips an INSERT, asserts trigger fired, cleans up.
--    Runs OUTSIDE the transaction so a failure aborts the migration loudly.
DO $$
DECLARE
  v_test_institution_id UUID;
  v_test_parent_category_id UUID;
  v_test_resource_id UUID;
  v_test_qr_token TEXT;
BEGIN
  -- Find any existing institution + parent_category to satisfy NOT NULL FKs.
  -- If neither exists in the target DB, we skip the test (e.g. fresh setup).
  SELECT id INTO v_test_institution_id FROM public.institutions LIMIT 1;
  SELECT id INTO v_test_parent_category_id FROM public.resource_parent_categories LIMIT 1;

  IF v_test_institution_id IS NULL OR v_test_parent_category_id IS NULL THEN
    RAISE NOTICE 'SKIP smoke test: no institutions OR resource_parent_categories rows present';
    RETURN;
  END IF;

  -- Insert with qr_code_token NULL — trigger should populate it
  INSERT INTO public.resources (
    name, parent_category_id, institution_id,
    initial_stock_quantity, current_stock_quantity,
    status, booking_type,
    booking_config, approval_config, reminder_config,
    access_roles
  ) VALUES (
    '__epsilon_smoke_test__', v_test_parent_category_id, v_test_institution_id,
    1, 1,
    'available', 'reservation',
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
    '{}'::text[]
  )
  RETURNING id, qr_code_token INTO v_test_resource_id, v_test_qr_token;

  IF v_test_qr_token IS NULL THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: trigger trg_resources_set_qr_token did not populate qr_code_token on INSERT';
  END IF;

  IF v_test_qr_token NOT LIKE 'res\_%' THEN
    RAISE EXCEPTION 'SMOKE TEST FAILED: qr_code_token=% does not match expected res_<hex> format', v_test_qr_token;
  END IF;

  -- Cleanup
  DELETE FROM public.resources WHERE id = v_test_resource_id;

  RAISE NOTICE 'SMOKE TEST PASSED: qr_code_token auto-populated as %', v_test_qr_token;
END $$;
