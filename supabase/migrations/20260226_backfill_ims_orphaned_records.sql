-- Migration: Backfill store_id on IMS records that were created without store context
-- Date: 2026-02-26
-- Purpose: Items, categories, sales, and financial transactions with store_id = NULL
--          are invisible to all IMS pages (every service query filters by store_id).
--          Assign them to the first active store so existing test data is visible.
-- Safe to re-run: uses WHERE store_id IS NULL guard.
-- Note: All institution_id columns in IMS tables are UUID type (not text).
--       ims_item_categories has no institution_id column — only store_id updated there.

DO $$
DECLARE
  v_store_id UUID;
  v_institution_id UUID;
  v_count BIGINT;
BEGIN
  -- Pick the first active store as the backfill target
  SELECT id, institution_id
  INTO v_store_id, v_institution_id
  FROM ims_stores
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE 'No active stores found — skipping backfill.';
    RETURN;
  END IF;

  RAISE NOTICE 'Backfilling orphaned IMS records to store: % (institution: %)', v_store_id, v_institution_id;

  UPDATE ims_items
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ims_items updated: % rows', v_count;

  -- ims_item_categories has no institution_id column
  UPDATE ims_item_categories
  SET store_id = v_store_id
  WHERE store_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ims_item_categories updated: % rows', v_count;

  UPDATE ims_sales
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ims_sales updated: % rows', v_count;

  UPDATE ims_financial_transactions
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'ims_financial_transactions updated: % rows', v_count;

  UPDATE ims_stock_batches
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;

  UPDATE ims_goods_received_notes
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;

  UPDATE ims_indent_requests
  SET store_id = v_store_id,
      institution_id = v_institution_id
  WHERE store_id IS NULL;

END $$;

NOTIFY pgrst, 'reload schema';
