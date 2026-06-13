-- ============================================================================
-- Migration: 20260522_platform_policies_typed_widget_metadata
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A1
-- ============================================================================
-- Adds 5 typed-widget metadata columns to platform_policies, enabling admin UIs
-- to render the correct widget (number/toggle/dropdown/multi-select/textarea/etc)
-- per policy row, with plain-English consequences and downstream-effect cascade.
--
-- Scope per substrate decision 29 in
-- specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md:
-- "AICBL-only — populate ONLY for new clinical_reasoning.* rows. Existing 5 PDE
-- policy categories stay hand-coded; retrofit is a future opt-in PR."
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS ui_widget TEXT,
  ADD COLUMN IF NOT EXISTS ui_options JSONB,
  ADD COLUMN IF NOT EXISTS ui_consequence TEXT,
  ADD COLUMN IF NOT EXISTS ui_cascade JSONB,
  ADD COLUMN IF NOT EXISTS ui_category TEXT;

COMMENT ON COLUMN platform_policies.ui_widget IS
  'Widget hint for admin UI renderer: number | toggle | dropdown | multi-select | textarea | text | sliders';

COMMENT ON COLUMN platform_policies.ui_options IS
  'JSONB array of {value, label} for dropdown/multi-select widgets. Example: [{"value":"openai","label":"OpenAI"}]';

COMMENT ON COLUMN platform_policies.ui_consequence IS
  'Plain-English description shown under the widget explaining what changes when this policy is edited.';

COMMENT ON COLUMN platform_policies.ui_cascade IS
  'JSONB array of {effect: string, severity: high|medium|low} describing downstream effects of changing this policy.';

COMMENT ON COLUMN platform_policies.ui_category IS
  'Grouping label for admin UI page (e.g., "AI Provider", "Caps & Limits", "Scoring", "Faculty Workflow").';

-- Index for fast category-grouped reads in the admin UI
CREATE INDEX IF NOT EXISTS idx_platform_policies_ui_category
  ON platform_policies (ui_category)
  WHERE ui_category IS NOT NULL;
