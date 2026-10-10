-- ─── Drop billing_scholarship_types.default_value_mode / default_value ───────
-- 2026-10-09
--
-- A type used to carry a default value mode (percentage | amount) and an optional
-- default value that pre-filled the Apply / Edit Scholarship form. The setup form
-- no longer asks for them and the Apply form no longer reads them: value mode is
-- chosen only when a scholarship is applied (billing_scholarships.value_mode).
-- The app code stopped touching the columns in dbaaf9e32.
--
-- ── Dependency scan (2026-10-09, live DB) ───────────────────────────────────
-- No function body, view, materialized view, policy or index references either
-- column. The only dependents are two CHECK constraints on this table, which
-- Postgres drops together with their columns:
--   billing_scholarship_types_mode_check           (default_value_mode IN (...))
--   billing_scholarship_types_default_value_check  (default_value > 0 AND <= 100 for %)
-- Data: all six rows held the defaults (mode 'percentage', value NULL), so nothing
-- is lost.
--
-- Applied through the Supabase MCP apply_migration as
-- "drop_scholarship_type_default_value_columns"; ledger version aligned to
-- 20271009140000.

ALTER TABLE public.billing_scholarship_types
  DROP COLUMN IF EXISTS default_value_mode,
  DROP COLUMN IF EXISTS default_value;
