-- ─────────────────────────────────────────────────────────────────────────────
-- 20260729120000_bos_letterhead_assets.sql
--
-- Per-institution seal + principal-signature images for BoS call-letter PDFs.
--
-- Until now the two assets were hardcoded file paths in
-- lib/utils/internal-marks/institution-header.ts (sealImage / signImage), which
-- meant only Arts & Science had them — engineering (CET) had no PNGs in the
-- repo at all, so its call letters rendered unsigned. Adding a new college's
-- seal required a code change + deploy.
--
-- This table moves both assets to runtime data, editable from
-- /bos/email-settings → "Seal & Signature". Images are stored as base64
-- `data:` URIs rather than storage-bucket URLs on purpose: the PDF is rendered
-- by headless Chromium with `page.setContent()` and no network origin, so a
-- remote <img src> would race the PDF snapshot (or silently 404 on a private
-- bucket). A data URI is always available at paint time.
--
-- One active row per institution. CAS Self/Aided are distinct institution rows
-- and therefore configure their seals independently — the same convention
-- bos_regulation_taxonomies uses.
--
-- RLS reuses the existing bos-compositions.* permission keys (identical to
-- bos_board_senders in 20260724140000) so NO new permission grant migration is
-- required — avoiding the key-format drift that has caused blank-page bugs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bos_letterhead_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  -- base64 `data:image/png;base64,…` URIs. NULL = not configured; the PDF then
  -- falls back to the hardcoded institution-header path (if any) and finally to
  -- rendering no image at all.
  seal_image      TEXT,
  signature_image TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE bos_letterhead_assets IS
  'Per-institution seal + principal signature (base64 data URIs) stamped on BoS call-letter PDFs. Managed at /bos/email-settings.';
COMMENT ON COLUMN bos_letterhead_assets.seal_image IS
  'Round office seal, rendered bottom-left of the signature row. data:image/*;base64 URI.';
COMMENT ON COLUMN bos_letterhead_assets.signature_image IS
  'Principal signature, rendered above the "Principal" line at bottom-right. data:image/*;base64 URI.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_letterhead_assets_active
  ON bos_letterhead_assets (institutions_id)
  WHERE is_active = true;

ALTER TABLE bos_letterhead_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bos_letterhead_assets_select ON bos_letterhead_assets;
CREATE POLICY bos_letterhead_assets_select ON bos_letterhead_assets
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.view')
        AND role_has_institution_access(institutions_id))
  );

DROP POLICY IF EXISTS bos_letterhead_assets_write ON bos_letterhead_assets;
CREATE POLICY bos_letterhead_assets_write ON bos_letterhead_assets
  FOR ALL TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.edit')
        AND role_has_institution_access(institutions_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.edit')
        AND role_has_institution_access(institutions_id))
  );

DROP TRIGGER IF EXISTS update_bos_letterhead_assets_updated_at ON bos_letterhead_assets;
CREATE TRIGGER update_bos_letterhead_assets_updated_at
  BEFORE UPDATE ON bos_letterhead_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
