-- ──────────────────────────────────────────────────────────────
-- Migration L: Add category + optional program/admission_year to campaigns
--
-- Adds:
--   * category text NOT NULL DEFAULT 'admission'
--     CHECK (category IN ('admission','event','promotion','awareness','other'))
--   * program_id        uuid REFERENCES programs(id)        — nullable
--   * admission_year_id uuid REFERENCES admission_years(id) — nullable
--   * CHECK: program_id and admission_year_id can only be non-null
--     when category = 'admission'. Other categories must leave them NULL.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE admission_campaigns
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'admission'
    CHECK (category IN ('admission', 'event', 'promotion', 'awareness', 'other'));

ALTER TABLE admission_campaigns
  ADD COLUMN IF NOT EXISTS program_id uuid
    REFERENCES programs(id) ON DELETE SET NULL;

ALTER TABLE admission_campaigns
  ADD COLUMN IF NOT EXISTS admission_year_id uuid
    REFERENCES admission_years(id) ON DELETE SET NULL;

ALTER TABLE admission_campaigns
  DROP CONSTRAINT IF EXISTS chk_campaigns_category_program_only_admission;

ALTER TABLE admission_campaigns
  ADD CONSTRAINT chk_campaigns_category_program_only_admission
  CHECK (
    category = 'admission'
    OR (program_id IS NULL AND admission_year_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_category
  ON admission_campaigns (category)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_program
  ON admission_campaigns (program_id)
  WHERE program_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_admission_year
  ON admission_campaigns (admission_year_id)
  WHERE admission_year_id IS NOT NULL AND archived_at IS NULL;
