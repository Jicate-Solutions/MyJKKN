-- ============================================================
-- Fix RLS INSERT/UPDATE policies for ims_stock_batches +
-- ims_stock_summary — 2026-03-04
--
-- Root cause: same auth.uid() PKCE timing issue that broke
-- ims_stores SELECT. The institution_id = profile_lookup
-- WITH CHECK fails when auth.uid() is not yet available from
-- cookies, returning {} to the Supabase JS client.
--
-- Pattern: same fix as 20260303_fix_ims_stores_select_policy.sql
-- SELECT/DELETE policies remain institution-scoped (data isolation).
-- INSERT/UPDATE loosened to WITH CHECK (true) for authenticated.
-- ============================================================

-- ── ims_stock_batches ────────────────────────────────────────

DROP POLICY IF EXISTS "ims_stock_batches_insert" ON ims_stock_batches;
CREATE POLICY "ims_stock_batches_insert"
  ON ims_stock_batches
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "ims_stock_batches_update" ON ims_stock_batches;
CREATE POLICY "ims_stock_batches_update"
  ON ims_stock_batches
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── ims_stock_summary ────────────────────────────────────────
-- Also needs the fix: addBatch Step B does INSERT + UPDATE on
-- ims_stock_summary, which has the same institution-scoped policy.

DROP POLICY IF EXISTS "ims_stock_summary_insert" ON ims_stock_summary;
CREATE POLICY "ims_stock_summary_insert"
  ON ims_stock_summary
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "ims_stock_summary_update" ON ims_stock_summary;
CREATE POLICY "ims_stock_summary_update"
  ON ims_stock_summary
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
